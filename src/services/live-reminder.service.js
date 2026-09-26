const LiveSession = require('../models/LiveSession');
const Enrollment = require('../models/Enrollment');
const Academy = require('../models/Academy');
const Notification = require('../models/Notification');
const LiveReminderDelivery = require('../models/LiveReminderDelivery');
const mailer = require('./mailer.service');

let timer = null;
let running = false;

function reminderMessage(session, courseTitle, minutes) {
  return {
    title: `تذكير: المحاضرة تبدأ بعد ${minutes} دقائق`,
    message: `${session.title}${courseTitle ? ' · ' + courseTitle : ''}. ادخل من AcademyFlow حتى يتم تسجيل حضورك تلقائيًا.`
  };
}

async function ensureDelivery({ academyId, sessionId, studentId, channel }) {
  return LiveReminderDelivery.findOneAndUpdate(
    { academyId, liveSessionId: sessionId, studentId, channel },
    {
      $setOnInsert: {
        academyId,
        liveSessionId: sessionId,
        studentId,
        channel,
        status: 'pending',
        attempts: 0
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

async function sendInApp({ academy, session, enrollment, student, courseTitle, minutes }) {
  const delivery = await ensureDelivery({
    academyId: academy._id,
    sessionId: session._id,
    studentId: student._id,
    channel: 'in_app'
  });

  if (['sent','skipped'].includes(delivery.status)) return delivery.status;

  const text = reminderMessage(session, courseTitle, minutes);
  const dedupeKey = `live-reminder:${session._id}:${student._id}`;

  await Notification.findOneAndUpdate(
    { dedupeKey },
    {
      $setOnInsert: {
        academyId: academy._id,
        courseId: session.courseId,
        groupId: session.groupId || null,
        recipientId: student._id,
        liveSessionId: session._id,
        type: 'live_reminder',
        dedupeKey,
        title: text.title,
        message: text.message,
        audience: 'students',
        channel: 'in_app',
        status: 'sent',
        sentAt: new Date()
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  delivery.status = 'sent';
  delivery.sentAt = delivery.sentAt || new Date();
  delivery.lastAttemptAt = new Date();
  delivery.attempts = Number(delivery.attempts || 0) + 1;
  delivery.error = '';
  await delivery.save();

  return 'sent';
}

async function sendEmail({ academy, session, student, courseTitle, minutes }) {
  const delivery = await ensureDelivery({
    academyId: academy._id,
    sessionId: session._id,
    studentId: student._id,
    channel: 'email'
  });

  if (['sent','skipped'].includes(delivery.status)) return delivery.status;
  if (delivery.status === 'failed' && Number(delivery.attempts || 0) >= 3) return 'failed_final';

  if (!student.email) {
    delivery.status = 'skipped';
    delivery.error = 'Student has no email';
    delivery.lastAttemptAt = new Date();
    await delivery.save();
    return 'skipped';
  }

  if (!mailer.configured()) {
    delivery.status = 'failed';
    delivery.error = 'RESEND_API_KEY غير موجود';
    delivery.lastAttemptAt = new Date();
    delivery.attempts = Math.max(1, Number(delivery.attempts || 0));
    await delivery.save();
    return 'failed_final';
  }

  const capability = mailer.canSendTo(student.email);
  if (!capability.allowed) {
    delivery.status = 'skipped';
    delivery.error = capability.reason;
    delivery.lastAttemptAt = new Date();
    await delivery.save();
    return 'skipped';
  }

  delivery.attempts = Number(delivery.attempts || 0) + 1;
  delivery.lastAttemptAt = new Date();

  try {
    await mailer.sendLiveReminder({
      to: student.email,
      studentName: student.name,
      academyName: academy.name,
      session: {
        ...session.toObject(),
        timezone: academy.timezone || 'Asia/Muscat'
      },
      minutes
    });

    delivery.status = 'sent';
    delivery.sentAt = new Date();
    delivery.error = '';
    await delivery.save();
    return 'sent';
  } catch (err) {
    const terminalCodes = new Set([
      'RESEND_TEST_MODE_ONLY',
      'RESEND_TEST_RECIPIENT_MISSING',
      'RECIPIENT_MISSING'
    ]);

    delivery.status = terminalCodes.has(err.code) ? 'skipped' : 'failed';
    delivery.error = String(err.message || 'Email failed').slice(0,1000);
    await delivery.save();

    if (delivery.status === 'skipped') return 'skipped';
    return delivery.attempts >= 3 ? 'failed_final' : 'retry';
  }
}

async function processSession(session) {
  const now = new Date();
  const dueAt = new Date(
    new Date(session.startAt).getTime() -
    Number(session.reminderMinutes ?? 5) * 60000
  );

  if (now < dueAt) return false;

  // Do not send a "before class" reminder after the class has already started.
  if (now.getTime() > new Date(session.startAt).getTime() + 30 * 1000) {
    await LiveSession.updateOne(
      { _id: session._id, reminderCompletedAt: null },
      {
        $set: {
          reminderCompletedAt: now,
          reminderClaimedAt: now,
          reminderStats: { inApp:0, email:0, emailFailed:0, skipped:0 }
        }
      }
    );
    return true;
  }

  const staleClaim = new Date(Date.now() - 5 * 60 * 1000);

  const claimed = await LiveSession.findOneAndUpdate(
    {
      _id: session._id,
      reminderCompletedAt: null,
      $or: [
        { reminderClaimedAt: null },
        { reminderClaimedAt: { $lt: staleClaim } }
      ]
    },
    { $set: { reminderClaimedAt: now } },
    { new: true }
  ).populate('courseId', 'title');

  if (!claimed) return false;

  const academy = await Academy.findById(claimed.academyId).select('name timezone');
  if (!academy) {
    claimed.reminderCompletedAt = new Date();
    await claimed.save();
    return true;
  }

  const enrollmentQuery = {
    academyId: claimed.academyId,
    courseId: claimed.courseId?._id || claimed.courseId,
    status: 'active'
  };

  if (claimed.groupId) enrollmentQuery.groupId = claimed.groupId;

  const enrollments = await Enrollment.find(enrollmentQuery)
    .populate('studentId', 'name email active')
    .select('studentId groupId');

  const students = enrollments.filter(row => row.studentId?.active !== false);
  const stats = { inApp:0, email:0, emailFailed:0, skipped:0 };
  let needsRetry = false;

  for (const enrollment of students) {
    const student = enrollment.studentId;
    const args = {
      academy,
      session: claimed,
      enrollment,
      student,
      courseTitle: claimed.courseId?.title || '',
      minutes: Number(claimed.reminderMinutes ?? 5)
    };

    if (claimed.notifyInApp) {
      try {
        const state = await sendInApp(args);
        if (state === 'sent') stats.inApp += 1;
        else stats.skipped += 1;
      } catch (err) {
        console.error('[live reminder in-app]', err.message);
        needsRetry = true;
      }
    }

    if (claimed.notifyEmail) {
      const state = await sendEmail(args);
      if (state === 'sent') stats.email += 1;
      else if (state === 'retry') {
        stats.emailFailed += 1;
        needsRetry = true;
      } else if (state === 'failed_final') {
        stats.emailFailed += 1;
      } else {
        stats.skipped += 1;
      }
    }
  }

  claimed.reminderStats = stats;

  if (needsRetry) {
    claimed.reminderClaimedAt = null;
  } else {
    claimed.reminderCompletedAt = new Date();
  }

  await claimed.save();
  return true;
}

async function runOnce() {
  if (running) return;
  running = true;

  try {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const staleFloor = new Date(now.getTime() - 10 * 60 * 1000);

    const candidates = await LiveSession.find({
      status: 'scheduled',
      startAt: { $gte: staleFloor, $lte: windowEnd },
      reminderCompletedAt: null,
      $or: [
        { notifyInApp: true },
        { notifyEmail: true }
      ]
    })
      .sort({ startAt: 1 })
      .limit(100);

    for (const session of candidates) {
      try {
        await processSession(session);
      } catch (err) {
        console.error('[live reminder session]', session._id, err.message);
        await LiveSession.updateOne(
          { _id: session._id },
          { $set: { reminderClaimedAt: null } }
        );
      }
    }
  } finally {
    running = false;
  }
}

function start() {
  if (timer) return;

  runOnce().catch(err => console.error('[live reminder worker]', err.message));

  timer = setInterval(() => {
    runOnce().catch(err => console.error('[live reminder worker]', err.message));
  }, 30 * 1000);

  if (typeof timer.unref === 'function') timer.unref();
}

module.exports = {
  start,
  runOnce
};
