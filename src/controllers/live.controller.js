const LiveSession = require('../models/LiveSession');
const Academy = require('../models/Academy');
const Course = require('../models/Course');
const User = require('../models/User');
const zoom = require('../services/zoom.service');

async function createLiveSession(req, res) {
  const academyId = req.academyId;
  const { title, description, instructorId, startAt, durationMinutes = 60, courseId } = req.body;

  if (!title || !instructorId || !startAt) {
    return res.status(400).json({ message: 'Title, instructor and start time are required' });
  }

  const [academy, instructor, course] = await Promise.all([
    Academy.findById(academyId),
    User.findOne({ _id: instructorId, academyId, role: 'instructor', active: true }),
    courseId ? Course.findOne({ _id: courseId, academyId }) : Promise.resolve(null)
  ]);

  if (!academy) return res.status(404).json({ message: 'Academy not found' });
  if (!instructor) return res.status(400).json({ message: 'Instructor does not belong to this academy' });
  if (courseId && !course) return res.status(400).json({ message: 'Course does not belong to this academy' });

  let meeting = { meetingId: '', joinUrl: '', startUrl: '', password: '' };

  if (zoom.configured()) {
    meeting = await zoom.createMeeting({
      topic: title,
      startTime: startAt,
      duration: Number(durationMinutes || 60),
      timezone: academy.timezone || 'Asia/Muscat'
    });
  }

  const session = await LiveSession.create({
    academyId,
    courseId: courseId || null,
    title: String(title).trim(),
    description: String(description || '').trim(),
    instructorId,
    startAt,
    durationMinutes: Number(durationMinutes || 60),
    zoomMeetingId: meeting.meetingId,
    zoomJoinUrl: meeting.joinUrl,
    zoomStartUrl: meeting.startUrl,
    zoomPassword: meeting.password
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
  const rows = await LiveSession.find({ academyId: req.academyId })
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
    provider: x.provider,
    zoomMeetingId: x.zoomMeetingId,
    zoomJoinUrl: x.zoomJoinUrl,
    status: x.status,
    createdAt: x.createdAt
  })));
}

module.exports = { createLiveSession, listLiveSessions };
