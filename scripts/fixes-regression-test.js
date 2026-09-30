require('./test-safety').assertSafeTestUri();
const assert = require('node:assert/strict');
const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');
const Academy = require('../src/models/Academy');
const Plan = require('../src/models/Plan');
const Course = require('../src/models/Course');
const Group = require('../src/models/Group');
const Enrollment = require('../src/models/Enrollment');
const Assessment = require('../src/models/Assessment');
const Submission = require('../src/models/AssignmentSubmission');
const Notification = require('../src/models/Notification');
const Payment = require('../src/models/Payment');
const SystemSetting = require('../src/models/SystemSetting');
const { CURRENT_LEGAL_VERSION } = require('../src/config/legal');
const { sign } = require('../src/controllers/auth.controller');
let server;
const passed = [];
async function main() {
  process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
  process.env.BACKUP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  await mongoose.connect(process.env.MONGODB_URI);
  await require('./test-safety').safeDropDatabase(mongoose.connection);
  const hash = await bcrypt.hash('RegressionPassword123!', 4);
  const academy = await Academy.create({ name: 'Regression', code: 'FIX-001', slug: 'fix-regression', status: 'active' });
  const createUser = (role, email, extras = {}) => User.create({ name: role, email, role, passwordHash: hash, academyId: academy._id, ...extras });
  const student = await createUser('student', 'student@example.test');
  const instructor = await createUser('instructor', 'instructor@example.test');
  const otherInstructor = await createUser('instructor', 'instructor2@example.test');
  const owner = await createUser('owner', 'owner@example.test', { legalAcceptance: { acceptedAt: new Date(), termsVersion: CURRENT_LEGAL_VERSION, privacyVersion: CURRENT_LEGAL_VERSION, dpaVersion: CURRENT_LEGAL_VERSION } });
  const course = await Course.create({ academyId: academy._id, title: 'Course', instructorId: otherInstructor._id, status: 'active' });
  await Course.create({ academyId: academy._id, title: 'Second course without code' });
  passed.push('optional course codes');
  const ownGroup = await Group.create({ academyId: academy._id, courseId: course._id, name: 'Own', instructorId: instructor._id });
  const otherGroup = await Group.create({ academyId: academy._id, courseId: course._id, name: 'Other', instructorId: otherInstructor._id });
  await Enrollment.create({ academyId: academy._id, courseId: course._id, studentId: student._id, groupId: ownGroup._id });
  await Promise.all([Submission.init(), require('../src/models/Attendance').init(), require('../src/models/RevokedSession').init(), require('../src/models/NotificationDelivery').init()]);
  const app = require('../src/server').app;
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.ALLOWED_ORIGINS = base;
  async function request(path, { method = 'GET', body, user, cookie, csrf, headers = {}, raw } = {}) {
    const response = await fetch(base + path, { method, headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}), ...(user ? { Authorization: 'Bearer ' + sign(user) } : {}),
      ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'x-csrf-token': csrf } : {}), ...headers
    }, body: raw || (body ? JSON.stringify(body) : undefined) });
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data, headers: response.headers };
  }
  const tokenResponse = await request('/api/auth/csrf');
  const csrf = tokenResponse.data.csrfToken;
  const csrfCookie = tokenResponse.headers.getSetCookie().find(v => v.startsWith('af_csrf=')).split(';')[0];
  const credentials = { academyCode: academy.code, email: student.email, password: 'RegressionPassword123!' };
  assert.equal((await request('/api/auth/login', { method: 'POST', body: credentials })).status, 403);
  assert.equal((await request('/api/auth/login', { method: 'POST', body: credentials, cookie: 'af_csrf=forged', csrf: 'forged' })).status, 403);
  assert.equal((await request('/api/auth/login', { method: 'POST', body: credentials, cookie: csrfCookie, csrf, headers: { Origin: 'https://evil.example' } })).status, 403);
  const login = await request('/api/auth/login', { method: 'POST', body: credentials, cookie: csrfCookie, csrf });
  assert.equal(login.status, 200);
  const sessionCookie = login.headers.getSetCookie().find(v => v.startsWith('af_session=') && !v.startsWith('af_session=;')).split(';')[0];
  const cookie = csrfCookie + '; ' + sessionCookie;
  assert.equal((await request('/api/student/profile', { method: 'PATCH', body: { name: 'blocked' }, cookie })).status, 403);
  assert.equal((await request('/api/student/profile', { method: 'PATCH', body: { name: 'allowed' }, cookie, csrf })).status, 200);
  assert.equal((await request('/api/auth/logout', { method: 'POST', cookie, csrf })).status, 200);
  assert.equal((await request('/api/auth/me', { cookie: sessionCookie })).status, 401);
  passed.push('CSRF missing/forged/cross-origin/cookie mutations; logout token revocation');
  const beforePasswordToken = sign(student);
  const passwordChange = await request('/api/auth/password', { method: 'POST', user: student, cookie: csrfCookie, csrf, body: { currentPassword: 'RegressionPassword123!', newPassword: 'NewRegressionPassword123!' } });
  assert.equal(passwordChange.status, 200);
  assert.equal((await request('/api/auth/me', { headers: { Authorization: 'Bearer ' + beforePasswordToken } })).status, 401);
  const freshStudent = await User.findById(student._id).select('+sessionVersion');
  assert.equal(freshStudent.sessionVersion, 1);
  passed.push('password changes invalidate previous sessions');
  await Notification.create([
    { academyId: academy._id, courseId: course._id, recipientId: student._id, title: 'Private certificate', message: 'private' },
    { academyId: academy._id, courseId: course._id, groupId: otherGroup._id, title: 'Other group', message: 'private group' },
    { academyId: academy._id, courseId: course._id, groupId: ownGroup._id, title: 'Own group', message: 'visible' },
    { academyId: academy._id, courseId: course._id, title: 'Course-wide', message: 'visible' }
  ]);
  const notifications = await request('/api/instructor/notifications', { user: instructor });
  assert.equal(notifications.status, 200);
  assert.deepEqual(notifications.data.map(row => row.title).sort(), ['Course-wide', 'Own group']);
  passed.push('private notifications and group isolation');
  const assignment = await Assessment.create({ academyId: academy._id, courseId: course._id, type: 'assignment', title: 'Assignment', status: 'published', dueAt: new Date(Date.now() + 600000) });
  const submit = body => request(`/api/student/assignments/${assignment._id}/submission`, { user: freshStudent, method: 'POST', body });
  assert.equal((await submit({ answerText: 'Answer' })).status, 201);
  await Submission.updateOne({ assessmentId: assignment._id }, { $set: { status: 'graded', score: 90, feedback: 'Keep grade' } });
  assert.equal((await submit({ answerText: 'Overwrite' })).status, 409);
  assert.equal((await Submission.findOne({ assessmentId: assignment._id })).score, 90);
  await Assessment.updateOne({ _id: assignment._id }, { $set: { dueAt: new Date(Date.now() - 60000) } });
  assert.equal((await submit({ answerText: 'Late' })).status, 403);
  await Assessment.updateOne({ _id: assignment._id }, { $set: { dueAt: null, availableFrom: new Date(Date.now() + 60000) } });
  assert.equal((await submit({ answerText: 'Early' })).status, 403);
  passed.push('assignment windows and graded submissions preserved');
  const attendance = require('../src/services/attendance.service');
  const attendanceData = { academyId: academy._id, studentId: student._id, courseId: course._id, groupId: ownGroup._id, date: '2026-09-30', status: 'present' };
  await Promise.all(Array.from({ length: 4 }, () => attendance.saveAttendance(attendanceData)));
  assert.equal(await require('../src/models/Attendance').countDocuments({ studentId: student._id }), 1);
  const liveAttendance = require('../src/services/live-attendance.service');
  const row = { lastJoinedAt: new Date('2026-09-30T10:00:00Z'), totalDurationSeconds: 0, save: async () => {} };
  await liveAttendance.recordZoomLeave({ row, at: new Date('2026-09-30T10:05:00Z') });
  await liveAttendance.recordZoomLeave({ row, at: new Date('2026-09-30T10:05:00Z') });
  assert.equal(row.totalDurationSeconds, 300);
  assert.throws(() => require('../src/services/timezone.service').parseAcademyDateTime('2026-02-31T10:00', 'Asia/Muscat'));
  passed.push('attendance deduplication, Zoom duplicate leave, calendar dates');
  const plan = await Plan.create({ name: 'Small', code: 'FIX-PLAN', limits: { students: 2, instructors: 2, courses: 2, branches: 1 } });
  await Academy.updateOne({ _id: academy._id }, { $set: { planId: plan._id } });
  const quota = require('../src/services/subscription.service');
  const created = await Promise.allSettled([1, 2].map(n => quota.createWithQuota(academy._id, 'students', User, { academyId: academy._id, name: 'quota', role: 'student', email: `quota${n}@example.test`, passwordHash: hash })));
  assert.equal(created.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(created.filter(result => result.status === 'rejected')[0].reason.status, 409);
  await Academy.updateOne({ _id: academy._id }, { $set: { status: 'trial', trialEndsAt: new Date(Date.now() - 1000) } });
  assert.equal((await request('/api/student/dashboard', { user: freshStudent })).status, 403);
  await Academy.updateOne({ _id: academy._id }, { $set: { status: 'active' } });
  await SystemSetting.create({ key: 'platform', maintenanceMode: true });
  assert.equal((await request('/api/student/profile', { user: freshStudent, method: 'PATCH', body: { name: 'maintenance' } })).status, 503);
  await SystemSetting.updateOne({ key: 'platform' }, { $set: { maintenanceMode: false } });
  passed.push('concurrent plan quotas, expired subscription, maintenance');
  process.env.SENDGRID_API_KEY = ''; process.env.WHATSAPP_ACCESS_TOKEN = '';
  const fakeEmail = await request('/api/academy/notifications', { user: owner, method: 'POST', body: { title: 'Test', message: 'Test', channel: 'email' } });
  assert.equal(fakeEmail.status, 503);
  assert.equal(await Notification.countDocuments({ title: 'Test' }), 0);
  passed.push('unconfigured notification provider fails honestly');
  const originalFetch = global.fetch;
  process.env.SENDGRID_API_KEY = 'fake-sendgrid-key'; process.env.SENDGRID_FROM_EMAIL = 'sender@example.test';
  let delivered = 0;
  global.fetch = async (url, options) => {
    if (url === 'https://api.sendgrid.com/v3/mail/send') { delivered++; return new Response(null, { status: 202 }); }
    return originalFetch(url, options);
  };
  try {
    const queued = await request('/api/academy/notifications', { user: owner, method: 'POST', body: { title: 'Queued email', message: 'Delivery test', audience: 'students', channel: 'email' } });
    assert.equal(queued.status, 201); assert.equal(queued.data.status, 'pending');
    await User.updateOne({ _id: student._id }, { $set: { 'notificationPreferences.email': false } });
    const worker = require('../src/services/notification-delivery.service');
    await worker.runOnce(); await worker.runOnce();
    assert.equal(delivered, 1);
    const rows = await require('../src/models/NotificationDelivery').find({ notificationId: queued.data._id });
    assert.deepEqual(rows.map(row => row.status).sort(), ['sent', 'skipped']);
    assert.equal((await Notification.findById(queued.data._id)).status, 'sent');
  } finally { global.fetch = originalFetch; process.env.SENDGRID_API_KEY = ''; }
  passed.push('durable notification delivery, actual acceptance state, preference opt-out and no duplicate send');
  const accountSecurity = require('../src/services/account-security.service');
  const resetToken = crypto.randomBytes(32).toString('hex');
  await User.updateOne({ _id: student._id }, { $set: { passwordResetHash: accountSecurity.resetHash(resetToken), passwordResetExpiresAt: new Date(Date.now() + 60000) } });
  const resetBody = { token: resetToken, newPassword: 'ResetRegressionPassword123!' };
  assert.equal((await request('/api/auth/reset-password', { method: 'POST', cookie: csrfCookie, csrf, body: resetBody })).status, 200);
  assert.equal((await request('/api/auth/reset-password', { method: 'POST', cookie: csrfCookie, csrf, body: resetBody })).status, 400);
  assert.equal((await request('/api/auth/me', { user: freshStudent })).status, 401);
  const mfaUser = await User.findById(student._id).select('+sessionVersion');
  const mfaSetup = await request('/api/auth/mfa/setup', { user: mfaUser, method: 'POST', cookie: csrfCookie, csrf, body: { password: resetBody.newPassword } });
  assert.equal(mfaSetup.status, 200);
  const totp = accountSecurity.totp(mfaSetup.data.secret);
  const code = totp.generate();
  assert.equal((await request('/api/auth/mfa/confirm', { user: mfaUser, method: 'POST', cookie: csrfCookie, csrf, body: { otp: code } })).status, 200);
  assert.equal((await request('/api/auth/me', { user: mfaUser })).status, 401);
  const mfaLogin = await request('/api/auth/login', { method: 'POST', cookie: csrfCookie, csrf, body: { ...credentials, password: resetBody.newPassword } });
  assert.equal(mfaLogin.status, 401); assert.equal(mfaLogin.data.code, 'MFA_REQUIRED');
  const replay = await request('/api/auth/login', { method: 'POST', cookie: csrfCookie, csrf, body: { ...credentials, password: resetBody.newPassword, otp: code } });
  assert.equal(replay.status, 401);
  passed.push('single-use recovery tokens and MFA encrypted setup/replay protection');
  const stripe = new (require('stripe'))('sk_test_fake');
  process.env.PAYMENTS_ENABLED = 'true'; process.env.STRIPE_SECRET_KEY = 'sk_test_fake'; process.env.STRIPE_WEBHOOK_SECRET = 'whsec_regression';
  const payment = await Payment.create({ academyId: academy._id, studentId: student._id, amount: 12, currency: 'USD', status: 'pending', stripeCheckoutId: 'cs_test_regression' });
  const event = { id: 'evt_regression', type: 'checkout.session.completed', data: { object: { id: payment.stripeCheckoutId, payment_status: 'paid', payment_intent: 'pi_test', amount_total: 1200, currency: 'usd', metadata: { paymentId: String(payment._id), academyId: String(academy._id) } } } };
  const raw = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({ payload: raw, secret: process.env.STRIPE_WEBHOOK_SECRET });
  assert.equal((await request('/api/webhooks/stripe', { method: 'POST', raw, headers: { 'Content-Type': 'application/json', 'stripe-signature': 'fake' } })).status, 400);
  const sendWebhook = () => request('/api/webhooks/stripe', { method: 'POST', raw, headers: { 'Content-Type': 'application/json', 'stripe-signature': signature } });
  assert.equal((await sendWebhook()).status, 200);
  assert.equal((await sendWebhook()).status, 200);
  assert.equal((await Payment.findById(payment._id)).status, 'paid');
  passed.push('signed Stripe webhook, amount matching, duplicate-event handling');
  const backup = require('../src/services/backup.service');
  const saved = await backup.createBackup();
  const { S3Client } = require('@aws-sdk/client-s3');
  const originalSend = S3Client.prototype.send;
  const uploaded = [];
  S3Client.prototype.send = async function (command) { uploaded.push(command.input); return {}; };
  process.env.EXTERNAL_BACKUP_BUCKET = 'fake-independent-bucket';
  process.env.EXTERNAL_BACKUP_ACCESS_KEY_ID = 'fake-key'; process.env.EXTERNAL_BACKUP_SECRET_ACCESS_KEY = 'fake-secret';
  try {
    const mirrored = await backup.createBackup({ reason: 'external-storage-test' });
    assert.equal(mirrored.external.uploaded, true);
    assert.equal(uploaded.length, 2);
    assert.ok(Buffer.isBuffer(uploaded[0].Body));
    assert.ok(uploaded[0].Key.endsWith('.backup'));
    const externalMetadata = JSON.parse(uploaded[1].Body);
    assert.equal(externalMetadata.encrypted, true);
    assert.equal(externalMetadata.sha256, crypto.createHash('sha256').update(uploaded[0].Body).digest('hex'));
  } finally {
    S3Client.prototype.send = originalSend;
    process.env.EXTERNAL_BACKUP_ACCESS_KEY_ID = ''; process.env.EXTERNAL_BACKUP_SECRET_ACCESS_KEY = '';
  }
  passed.push('independent encrypted S3 backup wiring and matching metadata');
  const before = await User.countDocuments();
  const originalCollection = mongoose.connection.db.collection.bind(mongoose.connection.db);
  mongoose.connection.db.collection = function (name, ...args) {
    const collection = originalCollection(name, ...args);
    if (name === 'users') collection.insertMany = async () => { throw new Error('Injected restore failure'); };
    return collection;
  };
  try { await assert.rejects(backup.restoreBackup(saved.id), /Injected restore failure/); }
  finally { mongoose.connection.db.collection = originalCollection; }
  assert.equal(await User.countDocuments(), before);
  assert.equal(await backup.restoreInProgress(), false);
  passed.push('restore failure rolls back deleted data atomically');
  await backup.restoreBackup(saved.id);
  assert.equal((await request('/api/auth/me', { user: owner })).status, 401);
  assert.ok(await require('../src/services/session-epoch.service').currentEpoch());
  passed.push('successful restore invalidates all previous JWT sessions');
  assert.equal((await request('/api/health')).status, 200);
  await mongoose.disconnect();
  assert.equal((await request('/api/health')).status, 503);
  passed.push('health reports disconnected database');
  for (const test of passed) console.log('PASS:', test);
}
main().catch(err => { console.error(err); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
});
