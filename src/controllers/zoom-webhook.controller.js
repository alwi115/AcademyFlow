const crypto = require('crypto');
const Academy = require('../models/Academy');
const LiveSession = require('../models/LiveSession');
const LiveAttendance = require('../models/LiveAttendance');
const User = require('../models/User');
const Enrollment = require('../models/Enrollment');
const {
  recordZoomJoin,
  recordZoomLeave
} = require('../services/live-attendance.service');

function secret() {
  return String(process.env.ZOOM_WEBHOOK_SECRET_TOKEN || '');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verify(req, raw) {
  const token = secret();
  if (!token) return false;

  const timestamp = String(req.headers['x-zm-request-timestamp'] || '');
  const signature = String(req.headers['x-zm-signature'] || '');

  if (!timestamp || !signature) return false;

  const age = Math.abs(Date.now() - Number(timestamp) * 1000);
  if (!Number.isFinite(age) || age > 5 * 60 * 1000) return false;

  const message = `v0:${timestamp}:${raw}`;
  const expected = 'v0=' + crypto
    .createHmac('sha256', token)
    .update(message)
    .digest('hex');

  return safeEqual(signature, expected);
}

function parseBody(req) {
  const raw = Buffer.isBuffer(req.body)
    ? req.body.toString('utf8')
    : String(req.body || '');

  return { raw, body: raw ? JSON.parse(raw) : {} };
}

function supportedEvent(value) {
  switch (value) {
    case 'endpoint.url_validation':
    case 'app_deauthorized':
    case 'meeting.started':
    case 'meeting.ended':
    case 'meeting.participant_joined':
    case 'meeting.participant_left':
      return value;
    default:
      return '';
  }
}

async function studentFromParticipant(session, participant) {
  const email = String(participant?.email || '').trim().toLowerCase();
  if (!email) return null;

  const student = await User.findOne({
    academyId: session.academyId,
    email,
    role: 'student',
    active: true
  }).select('_id');

  if (!student || !session.courseId) return null;

  const enrollment = await Enrollment.findOne({
    academyId: session.academyId,
    studentId: student._id,
    courseId: session.courseId,
    status: { $in: ['active','paused','completed'] }
  });

  if (!enrollment) return null;

  if (
    session.groupId &&
    String(enrollment.groupId || '') !== String(session.groupId)
  ) {
    return null;
  }

  return { student, enrollment };
}

async function handleParticipantJoined(session, participant) {
  const match = await studentFromParticipant(session, participant);
  if (!match) return;

  const joinedAt = participant?.join_time
    ? new Date(participant.join_time)
    : new Date();

  await recordZoomJoin({
    academyId: session.academyId,
    session,
    studentId: match.student._id,
    courseId: session.courseId,
    groupId: match.enrollment.groupId || null,
    participantId: participant?.id || participant?.user_id || '',
    at: joinedAt
  });
}

async function handleAppDeauthorized(body) {
  const payload = body?.payload || {};
  const zoomUserId = String(payload.user_id || '').trim();
  const clientId = String(payload.client_id || '').trim();

  if (!zoomUserId) return 0;

  // Ignore a deauthorization payload that names another app. The webhook
  // signature is still verified before this function is reached.
  if (
    clientId &&
    process.env.ZOOM_CLIENT_ID &&
    clientId !== process.env.ZOOM_CLIENT_ID
  ) {
    return 0;
  }

  const academies = await Academy.find({
    'zoomIntegration.zoomUserId': zoomUserId
  }).select(
    '_id +zoomIntegration.tokensEncrypted +zoomIntegration.oauthStateHash +zoomIntegration.oauthStateExpiresAt'
  );

  if (!academies.length) return 0;

  for (const academy of academies) {
    academy.zoomIntegration = {
      connected: false,
      zoomUserId: '',
      zoomEmail: '',
      zoomDisplayName: '',
      tokensEncrypted: '',
      accessTokenExpiresAt: null,
      connectedAt: null,
      connectedBy: null,
      oauthStateHash: '',
      oauthStateExpiresAt: null
    };

    await academy.save();
  }

  // Remove Zoom-specific meeting metadata retained by AcademyFlow after the
  // user removes the app. AcademyFlow's own class records stay intact.
  await LiveSession.updateMany(
    { academyId: { $in: academies.map(academy => academy._id) } },
    {
      $set: {
        zoomMeetingId: '',
        zoomJoinUrl: '',
        zoomStartUrl: '',
        zoomPassword: '',
        zoomProvisionError: 'Zoom app deauthorized'
      }
    }
  );

  return academies.length;
}

async function handleParticipantLeft(session, participant) {
  const participantId = String(participant?.id || participant?.user_id || '');

  let row = null;

  if (participantId) {
    row = await LiveAttendance.findOne({
      academyId: session.academyId,
      liveSessionId: session._id,
      zoomParticipantIds: participantId
    });
  }

  if (!row) {
    const match = await studentFromParticipant(session, participant);
    if (match) {
      row = await LiveAttendance.findOne({
        academyId: session.academyId,
        liveSessionId: session._id,
        studentId: match.student._id
      });
    }
  }

  if (!row) return;

  const leftAt = participant?.leave_time
    ? new Date(participant.leave_time)
    : new Date();

  await recordZoomLeave({ row, at: leftAt });
}

async function handle(req, res) {
  let parsed;

  try {
    parsed = parseBody(req);
  } catch {
    return res.status(400).json({ message: 'Invalid payload' });
  }

  if (!verify(req, parsed.raw)) {
    return res.status(401).json({ message: 'Invalid Zoom signature' });
  }

  const body = parsed.body;
  const event = supportedEvent(body.event);

  if (!event) return res.json({ ok: true });

  if (event === 'endpoint.url_validation') {
    const plainToken = String(body.payload?.plainToken || '');
    const encryptedToken = crypto
      .createHmac('sha256', secret())
      .update(plainToken)
      .digest('hex');

    return res.json({ plainToken, encryptedToken });
  }

  if (event === 'app_deauthorized') {
    await handleAppDeauthorized(body);
    return res.json({ ok: true });
  }

  const object = body.payload?.object || {};
  const meetingId = String(object.id || '');
  const participant = object.participant || null;

  if (!meetingId) return res.json({ ok: true });

  const session = await LiveSession.findOne({ zoomMeetingId: meetingId });
  if (!session) return res.json({ ok: true });

  if (event === 'meeting.started') {
    session.status = 'live';
    await session.save();
  }

  if (event === 'meeting.ended') {
    session.status = 'ended';
    await session.save();
  }

  if (event === 'meeting.participant_joined' && participant) {
    await handleParticipantJoined(session, participant);
  }

  if (event === 'meeting.participant_left' && participant) {
    await handleParticipantLeft(session, participant);
  }

  res.json({ ok: true });
}

module.exports = { handle };
