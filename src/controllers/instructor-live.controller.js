const Academy = require('../models/Academy');
const Enrollment = require('../models/Enrollment');
const LiveSession = require('../models/LiveSession');
const LiveAttendance = require('../models/LiveAttendance');
const LiveSeries = require('../models/LiveSeries');
const Group = require('../models/Group');
const zoom = require('../services/zoom.service');
const { createRecurringSeries, cancelFutureSeries } = require('../services/live-series.service');
const {
  safeTimeZone,
  parseAcademyDateTime,
  formatAcademyInput,
  formatAcademyDisplay
} = require('../services/timezone.service');
const {
  assertCourse,
  assertStudentEnrollment
} = require('../services/instructor-scope.service');

function clean(value) {
  return typeof value === 'string' ? value.trim() : value;
}

async function liveSessions(req, res) {
  const academy = await Academy.findById(req.academyId).select('timezone');
  const timezone = safeTimeZone(academy?.timezone || 'Asia/Muscat');

  const rows = await LiveSession.find({
    academyId: req.academyId,
    instructorId: req.user.sub
  })
    .populate('courseId', 'title code')
    .populate('groupId', 'name')
    .populate('seriesId', 'title startDate endDate weekdays time')
    .sort({ startAt: -1 });

  res.json(rows.map(row => ({
    id: row._id,
    title: row.title,
    description: row.description,
    course: row.courseId,
    group: row.groupId,
    series: row.seriesId,
    sequenceNumber: row.sequenceNumber,
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
    reminderCompletedAt: row.reminderCompletedAt,
    reminderStats: row.reminderStats,
    zoomMeetingId: row.zoomMeetingId,
    zoomReady: Boolean(row.zoomJoinUrl),
    hostReady: Boolean(row.zoomStartUrl),
    status: row.status
  })));
}

async function createLiveSession(req, res) {
  const {
    courseId, groupId, title, description, startAt, durationMinutes,
    attendanceEnabled, lateAfterMinutes, joinWindowBeforeMinutes,
    reminderMinutes, notifyInApp, notifyEmail
  } = req.body;

  if (!courseId || !clean(title) || !startAt) {
    return res.status(400).json({ message: 'الدورة والعنوان والموعد مطلوبة' });
  }

  const course = await assertCourse(req, courseId);
  const academy = await Academy.findById(req.academyId).select('timezone');
  const timezone = safeTimeZone(academy?.timezone || 'Asia/Muscat');
  const normalizedStartAt = parseAcademyDateTime(startAt, timezone);

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

  let meeting = {
    meetingId: '',
    joinUrl: '',
    startUrl: '',
    password: ''
  };

  if (zoom.configured()) {
    meeting = await zoom.createMeeting({
      topic: clean(title),
      startTime: normalizedStartAt,
      duration: Math.max(1, Number(durationMinutes || 60)),
      timezone
    });
  }

  const row = await LiveSession.create({
    academyId: req.academyId,
    courseId: course._id,
    groupId: group?._id || null,
    title: clean(title),
    description: clean(description),
    instructorId: req.user.sub,
    startAt: normalizedStartAt,
    durationMinutes: Math.max(1, Number(durationMinutes || 60)),
    zoomMeetingId: meeting.meetingId,
    zoomJoinUrl: meeting.joinUrl,
    zoomStartUrl: meeting.startUrl,
    zoomPassword: meeting.password,
    attendanceEnabled: attendanceEnabled !== false,
    lateAfterMinutes: Math.max(0, Number(lateAfterMinutes ?? 10)),
    joinWindowBeforeMinutes: Math.max(0, Number(joinWindowBeforeMinutes ?? 15)),
    reminderMinutes: Math.max(0, Math.min(1440, Number(reminderMinutes ?? 5))),
    notifyInApp: notifyInApp !== false,
    notifyEmail: notifyEmail !== false
  });

  res.status(201).json({
    id: row._id,
    title: row.title,
    startAt: row.startAt,
    startAtLocal: formatAcademyInput(row.startAt, timezone),
    startAtDisplay: formatAcademyDisplay(row.startAt, timezone),
    timezone,
    zoomReady: Boolean(row.zoomJoinUrl),
    group: group ? { _id: group._id, name: group.name } : null
  });
}

async function liveStart(req, res) {
  const row = await LiveSession.findOne({
    _id: req.params.id,
    academyId: req.academyId,
    instructorId: req.user.sub
  });

  if (!row) return res.status(404).json({ message: 'المحاضرة غير موجودة' });

  if (!row.zoomStartUrl) {
    return res.status(409).json({
      message: 'رابط المضيف غير متوفر. تأكد من إعداد تكامل Zoom.'
    });
  }

  res.set({ 'Cache-Control': 'no-store' });
  res.json({ startUrl: row.zoomStartUrl });
}

async function liveAttendance(req, res) {
  const session = await LiveSession.findOne({
    _id: req.params.id,
    academyId: req.academyId,
    instructorId: req.user.sub
  }).populate('courseId', 'title code');

  if (!session || !session.courseId) {
    return res.status(404).json({ message: 'المحاضرة غير موجودة' });
  }

  const enrollmentFilter = {
    academyId: req.academyId,
    courseId: session.courseId._id,
    status: { $in: ['active','paused','completed'] }
  };
  if (session.groupId) enrollmentFilter.groupId = session.groupId;

  const [enrollments, attendanceRows] = await Promise.all([
    Enrollment.find(enrollmentFilter)
      .populate('studentId', 'name email')
      .populate('groupId', 'name'),
    LiveAttendance.find({
      academyId: req.academyId,
      liveSessionId: session._id
    })
  ]);

  const map = new Map(
    attendanceRows.map(row => [String(row.studentId), row])
  );

  const rows = enrollments
    .filter(row => row.studentId)
    .map(enrollment => {
      const a = map.get(String(enrollment.studentId._id));

      return {
        student: enrollment.studentId,
        group: enrollment.groupId,
        attendanceStatus: a?.attendanceStatus || 'absent',
        lateMinutes: a?.lateMinutes || 0,
        firstPortalAt: a?.firstPortalAt || null,
        firstJoinedAt: a?.firstJoinedAt || null,
        leftAt: a?.leftAt || null,
        portalJoinCount: a?.portalJoinCount || 0,
        zoomJoinCount: a?.zoomJoinCount || 0,
        totalDurationSeconds: a?.totalDurationSeconds || 0,
        verifiedByZoom: Boolean(a?.verifiedByZoom),
        source: a?.source || 'none',
        manualOverride: Boolean(a?.manualOverride),
        note: a?.note || ''
      };
    });

  const academy = await Academy.findById(req.academyId).select('timezone');
  const timezone = safeTimeZone(academy?.timezone || 'Asia/Muscat');

  res.json({
    session: {
      id: session._id,
      title: session.title,
      course: session.courseId,
      startAt: session.startAt,
      startAtLocal: formatAcademyInput(session.startAt, timezone),
      startAtDisplay: formatAcademyDisplay(session.startAt, timezone),
      timezone,
      durationMinutes: session.durationMinutes,
      lateAfterMinutes: session.lateAfterMinutes,
      status: session.status
    },
    rows
  });
}

async function updateLiveAttendance(req, res) {
  const session = await LiveSession.findOne({
    _id: req.params.id,
    academyId: req.academyId,
    instructorId: req.user.sub
  });

  if (!session || !session.courseId) {
    return res.status(404).json({ message: 'المحاضرة غير موجودة' });
  }

  const enrollment = await assertStudentEnrollment(
    req,
    req.params.studentId,
    session.courseId
  );

  if (
    session.groupId &&
    String(enrollment.groupId || '') !== String(session.groupId)
  ) {
    return res.status(400).json({
      message: 'الطالب ليس ضمن مجموعة هذه المحاضرة'
    });
  }

  const attendanceStatus = req.body.attendanceStatus;

  if (!['present','late','absent','excused'].includes(attendanceStatus)) {
    return res.status(400).json({ message: 'حالة الحضور غير صحيحة' });
  }

  const row = await LiveAttendance.findOneAndUpdate(
    {
      academyId: req.academyId,
      liveSessionId: session._id,
      studentId: req.params.studentId
    },
    {
      $set: {
        courseId: session.courseId,
        groupId: enrollment.groupId || null,
        attendanceStatus,
        lateMinutes: attendanceStatus === 'late'
          ? Math.max(0, Number(req.body.lateMinutes || 0))
          : 0,
        manualOverride: true,
        source: 'manual',
        note: clean(req.body.note) || '',
        lastEventAt: new Date()
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  res.json(row);
}


async function updateLiveSession(req, res) {
  const row = await LiveSession.findOne({
    _id: req.params.id,
    academyId: req.academyId,
    instructorId: req.user.sub
  });

  if (!row) {
    return res.status(404).json({ message: 'المحاضرة غير موجودة أو لا تملك صلاحيتها' });
  }

  const academy = await Academy.findById(req.academyId).select('timezone');
  const timezone = safeTimeZone(academy?.timezone || 'Asia/Muscat');

  let nextCourseId = row.courseId;
  let nextGroupId = row.groupId;

  if (req.body.courseId !== undefined) {
    if (!req.body.courseId) {
      return res.status(400).json({ message: 'يجب تحديد دورة للمحاضرة' });
    }

    const course = await assertCourse(req, req.body.courseId);
    nextCourseId = course._id;

    if (nextGroupId) {
      const stillValid = await Group.exists({
        _id: nextGroupId,
        academyId: req.academyId,
        courseId: nextCourseId
      });
      if (!stillValid) nextGroupId = null;
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

  const nextTitle = req.body.title !== undefined
    ? clean(req.body.title)
    : row.title;

  const nextStartAt = req.body.startAt !== undefined
    ? parseAcademyDateTime(req.body.startAt, timezone)
    : row.startAt;

  const nextDuration = req.body.durationMinutes !== undefined
    ? Math.max(1, Number(req.body.durationMinutes || 1))
    : Number(row.durationMinutes || 60);

  if (!nextTitle || !nextStartAt) {
    return res.status(400).json({ message: 'العنوان وموعد البداية مطلوبان' });
  }

  if (!Number.isFinite(nextDuration) || nextDuration < 1) {
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
        duration: nextDuration,
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
      duration: nextDuration,
      timezone
    });
  }

  row.title = nextTitle;
  row.startAt = nextStartAt;
  row.durationMinutes = nextDuration;
  row.courseId = nextCourseId;
  row.groupId = nextGroupId;
  row.status = nextStatus;

  if (req.body.description !== undefined) {
    row.description = clean(req.body.description);
  }

  if (req.body.attendanceEnabled !== undefined) {
    row.attendanceEnabled = Boolean(req.body.attendanceEnabled);
  }

  if (req.body.lateAfterMinutes !== undefined) {
    row.lateAfterMinutes = Math.max(0, Number(req.body.lateAfterMinutes || 0));
  }

  if (req.body.joinWindowBeforeMinutes !== undefined) {
    row.joinWindowBeforeMinutes = Math.max(
      0,
      Number(req.body.joinWindowBeforeMinutes || 0)
    );
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
  await row.populate([{ path:'courseId', select:'title code' }, { path:'groupId', select:'name' }]);

  res.json({
    id: row._id,
    title: row.title,
    description: row.description,
    course: row.courseId,
    group: row.groupId,
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
    zoomReady: Boolean(row.zoomJoinUrl),
    hostReady: Boolean(row.zoomStartUrl),
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

  const [course, academy] = await Promise.all([
    assertCourse(req, courseId),
    Academy.findById(req.academyId)
  ]);

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
    instructorId: req.user.sub,
    body: req.body
  });

  res.status(201).json({
    series: result.series,
    createdSessions: result.sessions.length,
    zoomFailures: result.zoomFailures,
    sessions: result.sessions.map(row => ({
      id: row._id,
      title: row.title,
      startAt: row.startAt,
      zoomReady: Boolean(row.zoomJoinUrl)
    }))
  });
}

async function listLiveSeries(req, res) {
  const rows = await LiveSeries.find({
    academyId: req.academyId,
    instructorId: req.user.sub
  })
    .populate('courseId', 'title code')
    .populate('groupId', 'name')
    .sort({ createdAt: -1 });

  res.json(rows);
}

async function cancelLiveSeriesFuture(req, res) {
  const series = await LiveSeries.findOne({
    _id: req.params.seriesId,
    academyId: req.academyId,
    instructorId: req.user.sub
  });

  if (!series) {
    return res.status(404).json({ message: 'الجدول المتكرر غير موجود' });
  }

  const cancelled = await cancelFutureSeries({ series });
  res.json({ ok:true, cancelled });
}

module.exports = {
  liveSessions,
  createLiveSeries,
  listLiveSeries,
  cancelLiveSeriesFuture,
  createLiveSession,
  updateLiveSession,
  liveStart,
  liveAttendance,
  updateLiveAttendance
};
