const LiveSession = require('../models/LiveSession');
const Academy = require('../models/Academy');
const Course = require('../models/Course');
const User = require('../models/User');
const zoom = require('../services/zoom.service');

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
    joinWindowBeforeMinutes = 15
  } = req.body;

  if (req.user.role === 'instructor') {
    instructorId = req.user.sub;
  }

  if (!title || !instructorId || !startAt) {
    return res.status(400).json({
      message: 'العنوان والمدرب وموعد البداية مطلوبة'
    });
  }

  const [academy, instructor, course] = await Promise.all([
    Academy.findById(academyId),
    ownedInstructor(academyId, instructorId),
    ownedCourse(academyId, courseId)
  ]);

  if (!academy) return res.status(404).json({ message: 'الأكاديمية غير موجودة' });
  if (!instructor) return res.status(400).json({ message: 'المدرب المحدد غير صحيح' });
  if (courseId && !course) return res.status(400).json({ message: 'الدورة المحددة غير صحيحة' });

  if (
    req.user.role === 'instructor' &&
    course &&
    String(course.instructorId || '') !== String(req.user.sub)
  ) {
    return res.status(403).json({
      message: 'لا يمكنك إنشاء محاضرة لدورة مدرب آخر'
    });
  }

  const duration = Math.max(1, Number(durationMinutes || 60));
  let meeting = {
    meetingId: '',
    joinUrl: '',
    startUrl: '',
    password: ''
  };

  if (zoom.configured()) {
    meeting = await zoom.createMeeting({
      topic: clean(title),
      startTime: startAt,
      duration,
      timezone: academy.timezone || 'Asia/Muscat'
    });
  }

  const session = await LiveSession.create({
    academyId,
    courseId: courseId || null,
    title: clean(title),
    description: clean(description),
    instructorId,
    startAt,
    durationMinutes: duration,
    zoomMeetingId: meeting.meetingId,
    zoomJoinUrl: meeting.joinUrl,
    zoomStartUrl: meeting.startUrl,
    zoomPassword: meeting.password,
    attendanceEnabled: attendanceEnabled !== false,
    lateAfterMinutes: Math.max(0, Number(lateAfterMinutes ?? 10)),
    joinWindowBeforeMinutes: Math.max(0, Number(joinWindowBeforeMinutes ?? 15))
  });

  res.status(201).json({
    id: session._id,
    title: session.title,
    startAt: session.startAt,
    durationMinutes: session.durationMinutes,
    status: session.status,
    zoomJoinUrl: session.zoomJoinUrl || ''
  });
}

async function listLiveSessions(req, res) {
  const query = { academyId: req.academyId };

  if (req.user.role === 'instructor') {
    query.instructorId = req.user.sub;
  }

  const rows = await LiveSession.find(query)
    .populate('courseId', 'title code')
    .populate('instructorId', 'name email')
    .sort({ startAt: 1 });

  res.json(rows.map(x => ({
    id: x._id,
    title: x.title,
    description: x.description,
    courseId: x.courseId,
    instructorId: x.instructorId,
    startAt: x.startAt,
    durationMinutes: x.durationMinutes,
    attendanceEnabled: x.attendanceEnabled,
    lateAfterMinutes: x.lateAfterMinutes,
    joinWindowBeforeMinutes: x.joinWindowBeforeMinutes,
    provider: x.provider,
    zoomMeetingId: x.zoomMeetingId,
    zoomJoinUrl: x.zoomJoinUrl,
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

  let nextInstructorId = row.instructorId;
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
    } else {
      nextCourseId = null;
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
  const nextStartAt = req.body.startAt !== undefined ? req.body.startAt : row.startAt;
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
        timezone: academy?.timezone || 'Asia/Muscat'
      });

      row.zoomMeetingId = meeting.meetingId;
      row.zoomJoinUrl = meeting.joinUrl;
      row.zoomStartUrl = meeting.startUrl;
      row.zoomPassword = meeting.password;
    }
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
      timezone: academy?.timezone || 'Asia/Muscat'
    });
  }

  row.title = nextTitle;
  row.startAt = nextStartAt;
  row.durationMinutes = Number(nextDuration);
  row.status = nextStatus;
  row.courseId = nextCourseId;
  row.instructorId = nextInstructorId;

  if (req.body.description !== undefined) row.description = clean(req.body.description);
  if (req.body.attendanceEnabled !== undefined) row.attendanceEnabled = Boolean(req.body.attendanceEnabled);
  if (req.body.lateAfterMinutes !== undefined) {
    row.lateAfterMinutes = Math.max(0, Number(req.body.lateAfterMinutes || 0));
  }
  if (req.body.joinWindowBeforeMinutes !== undefined) {
    row.joinWindowBeforeMinutes = Math.max(0, Number(req.body.joinWindowBeforeMinutes || 0));
  }

  await row.save();
  await row.populate([
    { path:'courseId', select:'title code' },
    { path:'instructorId', select:'name email' }
  ]);

  res.json({
    id: row._id,
    title: row.title,
    description: row.description,
    courseId: row.courseId,
    instructorId: row.instructorId,
    startAt: row.startAt,
    durationMinutes: row.durationMinutes,
    attendanceEnabled: row.attendanceEnabled,
    lateAfterMinutes: row.lateAfterMinutes,
    joinWindowBeforeMinutes: row.joinWindowBeforeMinutes,
    zoomMeetingId: row.zoomMeetingId,
    zoomJoinUrl: row.zoomJoinUrl,
    status: row.status
  });
}

module.exports = {
  createLiveSession,
  listLiveSessions,
  updateLiveSession
};
