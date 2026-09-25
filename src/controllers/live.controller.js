const LiveSession = require('../models/LiveSession');
const Academy = require('../models/Academy');
const zoom = require('../services/zoom.service');

async function createLiveSession(req, res) {
  const academyId = req.academyId;
  const { title, description, instructorId, startAt, durationMinutes = 60, courseId } = req.body;
  if (!title || !instructorId || !startAt) return res.status(400).json({ message: 'Missing required fields' });

  const academy = await Academy.findById(academyId);
  if (!academy) return res.status(404).json({ message: 'Academy not found' });

  let meeting = { meetingId: '', joinUrl: '', startUrl: '', password: '' };
  if (zoom.configured()) {
    meeting = await zoom.createMeeting({ topic: title, startTime: startAt, duration: durationMinutes, timezone: academy.timezone || 'Asia/Muscat' });
  }

  const session = await LiveSession.create({
    academyId,
    courseId: courseId || null,
    title,
    description,
    instructorId,
    startAt,
    durationMinutes,
    zoomMeetingId: meeting.meetingId,
    zoomJoinUrl: meeting.joinUrl,
    zoomStartUrl: meeting.startUrl,
    zoomPassword: meeting.password
  });
  res.status(201).json(session);
}

async function listLiveSessions(req, res) {
  res.json(await LiveSession.find({ academyId: req.academyId }).sort({ startAt: 1 }));
}

module.exports = { createLiveSession, listLiveSessions };
