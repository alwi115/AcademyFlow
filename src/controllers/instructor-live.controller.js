const Academy = require('../models/Academy');
const Enrollment = require('../models/Enrollment');
const LiveSession = require('../models/LiveSession');
const LiveAttendance = require('../models/LiveAttendance');
const zoom = require('../services/zoom.service');
const {
  assertCourse,
  assertStudentEnrollment
} = require('../services/instructor-scope.service');

function clean(value) {
  return typeof value === 'string' ? value.trim() : value;
}

async function liveSessions(req, res) {
  const rows = await LiveSession.find({
    academyId: req.academyId,
    instructorId: req.user.sub
  })
    .populate('courseId', 'title code')
    .sort({ startAt: -1 });

  res.json(rows.map(row => ({
    id: row._id,
    title: row.title,
    description: row.description,
    course: row.courseId,
    startAt: row.startAt,
    durationMinutes: row.durationMinutes,
    attendanceEnabled: row.attendanceEnabled,
    lateAfterMinutes: row.lateAfterMinutes,
    joinWindowBeforeMinutes: row.joinWindowBeforeMinutes,
    zoomMeetingId: row.zoomMeetingId,
    zoomReady: Boolean(row.zoomJoinUrl),
    hostReady: Boolean(row.zoomStartUrl),
    status: row.status
  })));
}

async function createLiveSession(req, res) {
  const {
    courseId, title, description, startAt, durationMinutes,
    attendanceEnabled, lateAfterMinutes, joinWindowBeforeMinutes
  } = req.body;

  if (!courseId || !clean(title) || !startAt) {
    return res.status(400).json({ message: 'الدورة والعنوان والموعد مطلوبة' });
  }

  const course = await assertCourse(req, courseId);
  const academy = await Academy.findById(req.academyId).select('timezone');

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
      duration: Math.max(1, Number(durationMinutes || 60)),
      timezone: academy?.timezone || 'Asia/Muscat'
    });
  }

  const row = await LiveSession.create({
    academyId: req.academyId,
    courseId: course._id,
    title: clean(title),
    description: clean(description),
    instructorId: req.user.sub,
    startAt,
    durationMinutes: Math.max(1, Number(durationMinutes || 60)),
    zoomMeetingId: meeting.meetingId,
    zoomJoinUrl: meeting.joinUrl,
    zoomStartUrl: meeting.startUrl,
    zoomPassword: meeting.password,
    attendanceEnabled: attendanceEnabled !== false,
    lateAfterMinutes: Math.max(0, Number(lateAfterMinutes ?? 10)),
    joinWindowBeforeMinutes: Math.max(0, Number(joinWindowBeforeMinutes ?? 15))
  });

  res.status(201).json({
    id: row._id,
    title: row.title,
    startAt: row.startAt,
    zoomReady: Boolean(row.zoomJoinUrl)
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

  const [enrollments, attendanceRows] = await Promise.all([
    Enrollment.find({
      academyId: req.academyId,
      courseId: session.courseId._id,
      status: { $in: ['active','paused','completed'] }
    })
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

  res.json({
    session: {
      id: session._id,
      title: session.title,
      course: session.courseId,
      startAt: session.startAt,
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

module.exports = {
  liveSessions,
  createLiveSession,
  liveStart,
  liveAttendance,
  updateLiveAttendance
};
