const LiveSession = require('../models/LiveSession');
const Enrollment = require('../models/Enrollment');
const { recordPortalJoin, serialize } = require('../services/live-attendance.service');

async function joinSession(req, res) {
  const academyId = req.academyId;
  const studentId = req.user.sub;

  const session = await LiveSession.findOne({
    _id: req.params.sessionId,
    academyId
  });

  if (!session || !session.courseId) {
    return res.status(404).json({ message: 'المحاضرة غير متاحة' });
  }

  if (['ended','cancelled'].includes(session.status)) {
    return res.status(409).json({ message: 'انتهت هذه المحاضرة أو ألغيت' });
  }

  if (!session.zoomJoinUrl) {
    return res.status(409).json({ message: 'رابط Zoom غير متوفر لهذه المحاضرة' });
  }

  const enrollment = await Enrollment.findOne({
    academyId,
    studentId,
    courseId: session.courseId,
    status: { $in: ['active','paused','completed'] }
  });

  if (!enrollment) {
    return res.status(403).json({ message: 'هذه المحاضرة ليست ضمن دوراتك' });
  }

  const now = new Date();
  const start = new Date(session.startAt);
  const openAt = new Date(
    start.getTime() - Number(session.joinWindowBeforeMinutes || 0) * 60000
  );
  const softEnd = new Date(
    start.getTime() + (Number(session.durationMinutes || 60) + 60) * 60000
  );

  if (now < openAt) {
    return res.status(409).json({
      message: 'لم يفتح وقت الدخول بعد',
      opensAt: openAt
    });
  }

  if (now > softEnd && session.status !== 'live') {
    return res.status(409).json({ message: 'انتهى وقت الدخول إلى هذه المحاضرة' });
  }

  const attendance = session.attendanceEnabled
    ? await recordPortalJoin({
        academyId,
        session,
        studentId,
        courseId: session.courseId,
        groupId: enrollment.groupId || null,
        at: now
      })
    : null;

  res.set({ 'Cache-Control': 'no-store' });

  res.json({
    joinUrl: session.zoomJoinUrl,
    sessionId: session._id,
    serverTime: now,
    attendance: serialize(attendance)
  });
}

module.exports = { joinSession };
