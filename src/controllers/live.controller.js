const mongoose = require('mongoose');
const LiveSession = require('../models/LiveSession');
const Academy = require('../models/Academy');
const Course = require('../models/Course');
const User = require('../models/User');
const Group = require('../models/Group');
const LiveSeries = require('../models/LiveSeries');
const zoom = require('../services/zoom.service');
const { createRecurringSeries, cancelFutureSeries } = require('../services/live-series.service');
const {
  safeTimeZone,
  parseAcademyDateTime,
  formatAcademyInput,
  formatAcademyDisplay
} = require('../services/timezone.service');

function clean(value) {
  return typeof value === 'string' ? value.trim() : value;
}

async function ownedInstructor(academyId, instructorId) {
  return User.findOne({
    _id: instructorId,
    academyId,
    role: 'instructor',
    active: true
  });
}

async function ownedCourse(academyId, courseId) {
  if (!courseId) return null;
  return Course.findOne({ _id: courseId, academyId });
}

async function createLiveSession(req, res) {
  const academyId = req.academyId;
  let {
    title,
    description,
    instructorId,
    startAt,
    durationMinutes = 60,
    courseId,
    attendanceEnabled = true,
    lateAfterMinutes = 10,
    joinWindowBeforeMinutes = 15,
    groupId,
    reminderMinutes = 5,
    notifyInApp = true,
    notifyEmail = true
  } = req.body;

  if (req.user.role === 'instructor') {
    instructorId = req.user.sub;
  }

  if (!title || !instructorId || !startAt) {
    return res.status(400).json({
      message: 'العنوان والمدرب وموعد البداية مطلوبة'
    });
  }

  if (!mongoose.isValidObjectId(instructorId)) {
    return res.status(400).json({ message: 'المدرب المحدد غير صحيح' });
  }
  if (courseId && !mongoose.isValidObjectId(courseId)) {
    return res.status(400).json({ message: 'الدورة المحددة غير صحيحة' });
  }
  if (groupId && !mongoose.isValidObjectId(groupId)) {
    return res.status(400).json({ message: 'المجموعة المحددة غير صحيحة' });
  }

  const [academy, instructor, course] = await Promise.all([
    Academy.findById(academyId),
    ownedInstructor(academyId, instructorId),
    ownedCourse(academyId, courseId)
  ]);

  let group = null;
  if (groupId) {
    group = await Group.findOne({
      _id: groupId,
      academyId,
      courseId: courseId || null,
      status: { $ne: 'cancelled' }
    });
  }

  if (!academy) return res.status(404).json({ message: 'الأكاديمية غير موجودة' });
  if (!instructor) return res.status(400).json({ message: 'المدرب المحدد غير صحيح' });
  if (courseId && !course) return res.status(400).json({ message: 'الدورة المحددة غير صحيحة' });
  if (groupId && !group) return res.status(400).json({ message: 'المجموعة المحددة لا تتبع هذه الدورة' });

  if (
    req.user.role === 'instructor' &&
    course &&
    String(course.instructorId || '') !== String(req.user.sub)
  ) {
    return res.status(403).json({
      message: 'لا يمكنك إنشاء محاضرة لدورة مدرب آخر'
    });
  }

  const timezone = safeTimeZone(academy.timezone || 'Asia/Muscat');
  const normalizedStartAt = parseAcademyDateTime(startAt, timezone);
  const duration = Math.max(1, Number(durationMinutes || 60));

  if (!Number.isFinite(duration)) {
    return res.status(400).json({ message: 'مدة المحاضرة غير صحيحة' });
  }

  // Save the AcademyFlow session first. External Zoom failures must never
  // prevent the owner/instructor from creating the class.
  let session;
  try {
    session = await LiveSession.create({
      academyId,
      courseId: courseId || null,
      groupId: group?._id || null,
      title: clean(title),
      description: clean(description),
      instructorId,
      startAt: normalizedStartAt,
      durationMinutes: duration,
      attendanceEnabled: attendanceEnabled !== false,
      lateAfterMinutes: Math.max(0, Number(lateAfterMinutes ?? 10)),
      joinWindowBeforeMinutes: Math.max(0, Number(joinWindowBeforeMinutes ?? 15)),
      reminderMinutes: Math.max(0, Math.min(1440, Number(reminderMinutes ?? 5))),
      notifyInApp: notifyInApp !== false,
      notifyEmail: notifyEmail !== false
    });
  } catch (err) {
    if (err?.name === 'ValidationError' || err?.name === 'CastError') {
      return res.status(400).json({
        message: 'تعذر حفظ المحاضرة بسبب قيمة غير صحيحة في أحد الحقول'
      });
    }
    throw err;
  }

  let zoomWarning = '';

  if (!zoom.configured()) {
    zoomWarning = 'تم حفظ المحاضرة، لكن تكامل Zoom غير مفعّل في إعدادات السيرفر.';
    session.zoomProvisionError = 'Zoom integration is not configured';
    await session.save();
  } else {
    try {
      const meeting = await zoom.createMeeting({
        topic: clean(title),
        startTime: normalizedStartAt,
        duration,
        timezone
      });

      session.zoomMeetingId = meeting.meetingId;
      session.zoomJoinUrl = meeting.joinUrl;
      session.zoomStartUrl = meeting.startUrl;
      session.zoomPassword = meeting.password;
      session.zoomProvisionError = '';
      await session.save();
    } catch (err) {
      console.error('[zoom create meeting]', err.message);
      zoomWarning = 'تم حفظ المحاضرة، لكن تعذر إنشاء رابط Zoom الآن. يمكنك إعادة إنشاء الرابط لاحقًا.';
      session.zoomProvisionError = String(err.message || 'Zoom meeting creation failed').slice(0,1000);
      await session.save();
    }
  }

  res.status(201).json({
    id: session._id,
    title: session.title,
    startAt: session.startAt,
    startAtLocal: formatAcademyInput(session.startAt, timezone),
    startAtDisplay: formatAcademyDisplay(session.startAt, timezone),
    timezone,
    durationMinutes: session.durationMinutes,
    status: session.status,
    zoomMeetingId: session.zoomMeetingId || '',
    zoomJoinUrl: session.zoomJoinUrl || '',
    zoomReady: Boolean(session.zoomJoinUrl),
    zoomWarning
  });
}

async function listLiveSessions(req, res) {
  const academy = await Academy.findById(req.academyId).select('timezone');
  const timezone = safeTimeZone(academy?.timezone || 'Asia/Muscat');
  const query = { academyId: req.academyId };

  if (req.user.role === 'instructor') {
    query.instructorId = req.user.sub;
  }

  const rows = await LiveSession.find(query)
    .populate('courseId', 'title code')
    .populate('groupId', 'name')
    .populate('seriesId', 'title startDate endDate weekdays time')
    .populate('instructorId', 'name email')
    .sort({ startAt: 1 });

  res.json(rows.map(x => ({
    id: x._id,
    title: x.title,
    description: x.description,
    courseId: x.courseId,
    groupId: x.groupId,
    seriesId: x.seriesId,
    sequenceNumber: x.sequenceNumber,
    instructorId: x.instructorId,
    startAt: x.startAt,
    startAtLocal: formatAcademyInput(x.startAt, timezone),
    startAtDisplay: formatAcademyDisplay(x.startAt, timezone),
    timezone,
    durationMinutes: x.durationMinutes,
    attendanceEnabled: x.attendanceEnabled,
    lateAfterMinutes: x.lateAfterMinutes,
    joinWindowBeforeMinutes: x.joinWindowBeforeMinutes,
    provider: x.provider,
    zoomMeetingId: x.zoomMeetingId,
    zoomJoinUrl: x.zoomJoinUrl,
    reminderMinutes: x.reminderMinutes,
    notifyInApp: x.notifyInApp,
    notifyEmail: x.notifyEmail,
    reminderCompletedAt: x.reminderCompletedAt,
    reminderStats: x.reminderStats,
    status: x.status,
    createdAt: x.createdAt
  })));
}

async function updateLiveSession(req, res) {
  const query = {
    _id: req.params.id,
    academyId: req.academyId
  };

  if (req.user.role === 'instructor') {
    query.instructorId = req.user.sub;
  }

  const row = await LiveSession.findOne(query);

  if (!row) {
    return res.status(404).json({ message: 'المحاضرة غير موجودة أو لا تملك صلاحيتها' });
  }

  const academy = await Academy.findById(req.academyId).select('timezone');
  const timezone = safeTimeZone(academy?.timezone || 'Asia/Muscat');

  let nextInstructorId = row.instructorId;
  let nextGroupId = row.groupId;
  if (req.body.instructorId !== undefined && req.user.role !== 'instructor') {
    if (!req.body.instructorId) {
      return res.status(400).json({ message: 'يجب تحديد مدرب للمحاضرة' });
    }

    const instructor = await ownedInstructor(req.academyId, req.body.instructorId);
    if (!instructor) {
      return res.status(400).json({ message: 'المدرب المحدد غير صحيح' });
    }
    nextInstructorId = instructor._id;
  }

  let nextCourseId = row.courseId;
  if (req.body.courseId !== undefined) {
    if (req.body.courseId) {
      const course = await ownedCourse(req.academyId, req.body.courseId);
      if (!course) {
        return res.status(400).json({ message: 'الدورة المحددة غير صحيحة' });
      }

      if (
        req.user.role === 'instructor' &&
        String(course.instructorId || '') !== String(req.user.sub)
      ) {
        return res.status(403).json({ message: 'لا يمكنك نقل المحاضرة إلى دورة مدرب آخر' });
      }

      nextCourseId = course._id;

      if (nextGroupId) {
        const stillValid = await Group.exists({
          _id: nextGroupId,
          academyId: req.academyId,
          courseId: nextCourseId
        });
        if (!stillValid) nextGroupId = null;
      }
    } else {
      nextCourseId = null;
      nextGroupId = null;
    }
  }

  if (req.body.groupId !== undefined) {
    if (req.body.groupId) {
      const group = await Group.findOne({
        _id: req.body.groupId,
        academyId: req.academyId,
        courseId: nextCourseId,
        status: { $ne: 'cancelled' }
      });

      if (!group) {
        return res.status(400).json({ message: 'المجموعة المحددة لا تتبع هذه الدورة' });
      }
      nextGroupId = group._id;
    } else {
      nextGroupId = null;
    }
  }

  const previousStatus = row.status;
  const nextStatus = req.body.status !== undefined
    ? String(req.body.status)
    : row.status;

  if (!['scheduled','live','ended','cancelled'].includes(nextStatus)) {
    return res.status(400).json({ message: 'حالة المحاضرة غير صحيحة' });
  }

  const nextTitle = req.body.title !== undefined ? clean(req.body.title) : row.title;
  const nextStartAt = req.body.startAt !== undefined
    ? parseAcademyDateTime(req.body.startAt, timezone)
    : row.startAt;
  const nextDuration = req.body.durationMinutes !== undefined
    ? Math.max(1, Number(req.body.durationMinutes || 1))
    : row.durationMinutes;

  if (!nextTitle || !nextStartAt) {
    return res.status(400).json({ message: 'العنوان وموعد البداية مطلوبان' });
  }

  if (!Number.isFinite(Number(nextDuration)) || Number(nextDuration) < 1) {
    return res.status(400).json({ message: 'مدة المحاضرة غير صحيحة' });
  }

  if (nextStatus === 'cancelled' && previousStatus !== 'cancelled') {
    await zoom.deleteMeeting(row.zoomMeetingId);
    row.zoomMeetingId = '';
    row.zoomJoinUrl = '';
    row.zoomStartUrl = '';
    row.zoomPassword = '';
  } else if (previousStatus === 'cancelled' && nextStatus === 'scheduled') {
    if (zoom.configured()) {
      const meeting = await zoom.createMeeting({
        topic: nextTitle,
        startTime: nextStartAt,
        duration: Number(nextDuration),
        timezone
      });

      row.zoomMeetingId = meeting.meetingId;
      row.zoomJoinUrl = meeting.joinUrl;
      row.zoomStartUrl = meeting.startUrl;
      row.zoomPassword = meeting.password;
    }
  } else if (
    !row.zoomMeetingId &&
    nextStatus === 'scheduled' &&
    zoom.configured()
  ) {
    const meeting = await zoom.createMeeting({
      topic: nextTitle,
      startTime: nextStartAt,
      duration: Number(nextDuration),
      timezone
    });

    row.zoomMeetingId = meeting.meetingId;
    row.zoomJoinUrl = meeting.joinUrl;
    row.zoomStartUrl = meeting.startUrl;
    row.zoomPassword = meeting.password;
    row.zoomProvisionError = '';
  } else if (
    row.zoomMeetingId &&
    (
      req.body.title !== undefined ||
      req.body.startAt !== undefined ||
      req.body.durationMinutes !== undefined
    )
  ) {
    await zoom.updateMeeting(row.zoomMeetingId, {
      topic: nextTitle,
      startTime: nextStartAt,
      duration: Number(nextDuration),
      timezone
    });
  }

  row.title = nextTitle;
  row.startAt = nextStartAt;
  row.durationMinutes = Number(nextDuration);
  row.status = nextStatus;
  row.courseId = nextCourseId;
  row.groupId = nextGroupId;
  row.instructorId = nextInstructorId;

  if (req.body.description !== undefined) row.description = clean(req.body.description);
  if (req.body.attendanceEnabled !== undefined) row.attendanceEnabled = Boolean(req.body.attendanceEnabled);
  if (req.body.lateAfterMinutes !== undefined) {
    row.lateAfterMinutes = Math.max(0, Number(req.body.lateAfterMinutes || 0));
  }
  if (req.body.joinWindowBeforeMinutes !== undefined) {
    row.joinWindowBeforeMinutes = Math.max(0, Number(req.body.joinWindowBeforeMinutes || 0));
  }

  if (req.body.reminderMinutes !== undefined) {
    row.reminderMinutes = Math.max(0, Math.min(1440, Number(req.body.reminderMinutes || 0)));
    row.reminderCompletedAt = null;
    row.reminderClaimedAt = null;
  }

  if (req.body.notifyInApp !== undefined) {
    row.notifyInApp = Boolean(req.body.notifyInApp);
    row.reminderCompletedAt = null;
    row.reminderClaimedAt = null;
  }

  if (req.body.notifyEmail !== undefined) {
    row.notifyEmail = Boolean(req.body.notifyEmail);
    row.reminderCompletedAt = null;
    row.reminderClaimedAt = null;
  }

  await row.save();
  await row.populate([
    { path:'courseId', select:'title code' },
    { path:'groupId', select:'name' },
    { path:'instructorId', select:'name email' }
  ]);

  res.json({
    id: row._id,
    title: row.title,
    description: row.description,
    courseId: row.courseId,
    groupId: row.groupId,
    instructorId: row.instructorId,
    startAt: row.startAt,
    startAtLocal: formatAcademyInput(row.startAt, timezone),
    startAtDisplay: formatAcademyDisplay(row.startAt, timezone),
    timezone,
    durationMinutes: row.durationMinutes,
    attendanceEnabled: row.attendanceEnabled,
    lateAfterMinutes: row.lateAfterMinutes,
    joinWindowBeforeMinutes: row.joinWindowBeforeMinutes,
    reminderMinutes: row.reminderMinutes,
    notifyInApp: row.notifyInApp,
    notifyEmail: row.notifyEmail,
    zoomMeetingId: row.zoomMeetingId,
    zoomJoinUrl: row.zoomJoinUrl,
    status: row.status
  });
}


async function createLiveSeries(req, res) {
  const {
    courseId, groupId, title, startDate, endDate, weekdays, time
  } = req.body;

  if (!courseId || !clean(title) || !startDate || !endDate || !time) {
    return res.status(400).json({
      message: 'الدورة والعنوان وتاريخ البداية والنهاية والوقت مطلوبة'
    });
  }

  const [academy, course] = await Promise.all([
    Academy.findById(req.academyId),
    ownedCourse(req.academyId, courseId)
  ]);

  if (!academy || !course) {
    return res.status(400).json({ message: 'الأكاديمية أو الدورة غير صحيحة' });
  }

  const instructorId = req.body.instructorId || course.instructorId;
  const instructor = await ownedInstructor(req.academyId, instructorId);

  if (!instructor) {
    return res.status(400).json({ message: 'حدد مدربًا صحيحًا للجدول' });
  }

  let group = null;
  if (groupId) {
    group = await Group.findOne({
      _id: groupId,
      academyId: req.academyId,
      courseId: course._id,
      status: { $ne: 'cancelled' }
    });

    if (!group) {
      return res.status(400).json({ message: 'المجموعة المحددة لا تتبع هذه الدورة' });
    }
  }

  const result = await createRecurringSeries({
    academy,
    course,
    group,
    instructorId: instructor._id,
    body: req.body
  });

  res.status(201).json({
    series: result.series,
    createdSessions: result.sessions.length,
    zoomFailures: result.zoomFailures
  });
}

async function listLiveSeries(req, res) {
  const rows = await LiveSeries.find({
    academyId: req.academyId
  })
    .populate('courseId', 'title code')
    .populate('groupId', 'name')
    .populate('instructorId', 'name email')
    .sort({ createdAt: -1 });

  res.json(rows);
}

async function cancelLiveSeriesFuture(req, res) {
  const series = await LiveSeries.findOne({
    _id: req.params.seriesId,
    academyId: req.academyId
  });

  if (!series) {
    return res.status(404).json({ message: 'الجدول المتكرر غير موجود' });
  }

  const cancelled = await cancelFutureSeries({ series });
  res.json({ ok:true, cancelled });
}

module.exports = {
  createLiveSession,
  createLiveSeries,
  listLiveSeries,
  cancelLiveSeriesFuture,
  listLiveSessions,
  updateLiveSession
};
