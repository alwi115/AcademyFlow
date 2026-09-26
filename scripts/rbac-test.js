const assert = require('assert');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const Academy = require('../src/models/Academy');
const User = require('../src/models/User');
const Course = require('../src/models/Course');
const Group = require('../src/models/Group');
const Enrollment = require('../src/models/Enrollment');
const LiveSession = require('../src/models/LiveSession');

const academyRoutes = require('../src/routes/academy.routes');
const instructorRoutes = require('../src/routes/instructor.routes');
const liveRoutes = require('../src/routes/live.routes');

async function connectWithRetry() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  let lastError;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 1000 });
      return;
    } catch (err) {
      lastError = err;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  throw lastError || new Error('Could not connect to MongoDB');
}

function sessionToken(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      role: user.role,
      academyId: user.academyId ? String(user.academyId) : null
    },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}

async function main() {
  process.env.JWT_SECRET = process.env.JWT_SECRET ||
    'rbac-regression-secret-0123456789-abcdefghijklmnopqrstuvwxyz-ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  await connectWithRetry();
  await mongoose.connection.db.dropDatabase();

  const passwordHash = await bcrypt.hash('StrongTestPassword123!', 4);

  const academy = await Academy.create({
    code: 'RBAC-A',
    name: 'RBAC Academy',
    slug: 'rbac-academy',
    status: 'active'
  });

  async function makeUser(role, name) {
    return User.create({
      academyId: academy._id,
      name,
      email: role + '-' + Date.now() + '-' + Math.random().toString(16).slice(2) + '@example.test',
      passwordHash,
      role,
      active: true
    });
  }

  const users = {};
  for (const role of [
    'owner','admin','branch_manager','accountant','reception',
    'content_manager','support','instructor','student'
  ]) {
    users[role] = await makeUser(role, role);
  }
  const unEnrolledStudent = await makeUser('student', 'Unenrolled student');

  const course = await Course.create({
    academyId: academy._id,
    title: 'RBAC Course',
    code: 'RBAC-COURSE',
    instructorId: users.instructor._id,
    price: 25,
    status: 'active'
  });

  const group = await Group.create({
    academyId: academy._id,
    courseId: course._id,
    instructorId: users.instructor._id,
    name: 'RBAC Group',
    status: 'active'
  });

  await Enrollment.create({
    academyId: academy._id,
    studentId: users.student._id,
    courseId: course._id,
    groupId: group._id,
    status: 'active'
  });

  await LiveSession.create({
    academyId: academy._id,
    courseId: course._id,
    groupId: group._id,
    title: 'RBAC Live',
    instructorId: users.instructor._id,
    startAt: new Date(Date.now() + 60 * 60 * 1000),
    zoomJoinUrl: 'https://zoom.example.test/join/secret',
    status: 'scheduled'
  });

  const app = express();
  app.use(express.json());
  app.use('/api/academy', academyRoutes);
  app.use('/api/instructor', instructorRoutes);
  app.use('/api/live-sessions', liveRoutes);
  app.use((err, req, res, next) => {
    res.status(Number(err.status || 500)).json({
      message: Number(err.status || 500) >= 500 ? 'Internal server error' : err.message
    });
  });

  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  const { port } = server.address();
  const base = 'http://127.0.0.1:' + port;

  async function request(role, path, options = {}) {
    const token = sessionToken(users[role]);
    const response = await fetch(base + path, {
      ...options,
      headers: {
        Authorization: 'Bearer ' + token,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });

    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { status: response.status, body };
  }

  async function expect(role, method, path, status, body) {
    const result = await request(role, path, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    assert.strictEqual(
      result.status,
      status,
      role + ' ' + method + ' ' + path + ' expected ' + status + ' got ' + result.status +
        ' body=' + JSON.stringify(result.body)
    );
    return result;
  }

  try {
    // Instructor must use the instructor portal/API only.
    await expect('instructor', 'GET', '/api/academy/dashboard', 403);
    await expect('instructor', 'GET', '/api/academy/attendance', 403);
    await expect('instructor', 'POST', '/api/academy/assessments', 403, {
      courseId: String(course._id),
      type: 'assignment',
      title: 'Forbidden generic assignment'
    });
    await expect('instructor', 'GET', '/api/live-sessions', 403);
    await expect('instructor', 'GET', '/api/instructor/options', 200);
    await expect('instructor', 'GET', '/api/instructor/quizzes', 200);
    await expect('instructor', 'GET', '/api/instructor/live', 200);

    // Accountant: financial access only, no teaching/people administration.
    await expect('accountant', 'GET', '/api/academy/payments', 200);
    await expect('accountant', 'GET', '/api/academy/reports', 200);
    await expect('accountant', 'GET', '/api/academy/attendance', 403);
    await expect('accountant', 'GET', '/api/academy/courses', 403);
    await expect('accountant', 'GET', '/api/academy/users?kind=student', 403);
    const accountantOptions = await expect('accountant', 'GET', '/api/academy/options', 200);
    assert(accountantOptions.body.students.length >= 1);
    assert(accountantOptions.body.courses.length >= 1);
    assert.strictEqual(accountantOptions.body.instructors.length, 0);
    assert.strictEqual(accountantOptions.body.groups.length, 0);
    assert.strictEqual(accountantOptions.body.branches.length, 0);
    const accountantDashboard = await expect('accountant', 'GET', '/api/academy/dashboard', 200);
    assert.strictEqual(accountantDashboard.body.upcomingSessions.length, 0);
    assert.notStrictEqual(accountantDashboard.body.revenue, null);

    // Support: communications/support only; no people/content/financial data.
    await expect('support', 'GET', '/api/academy/notifications', 200);
    await expect('support', 'POST', '/api/academy/notifications', 201, {
      title: 'Support notice',
      message: 'System notice',
      audience: 'all',
      channel: 'in_app',
      status: 'sent'
    });
    await expect('support', 'GET', '/api/academy/users?kind=student', 403);
    await expect('support', 'GET', '/api/academy/courses', 403);
    await expect('support', 'GET', '/api/academy/payments', 403);
    const supportOptions = await expect('support', 'GET', '/api/academy/options', 200);
    assert.strictEqual(supportOptions.body.students.length, 0);
    assert.strictEqual(supportOptions.body.instructors.length, 0);
    assert.strictEqual(supportOptions.body.courses.length, 0);
    assert.strictEqual(supportOptions.body.groups.length, 0);
    assert.strictEqual(supportOptions.body.branches.length, 0);
    const supportDashboard = await expect('support', 'GET', '/api/academy/dashboard', 200);
    assert.strictEqual(supportDashboard.body.revenue, null);
    assert.strictEqual(supportDashboard.body.upcomingSessions.length, 0);

    // Reception: operations allowed, finance/content administration denied.
    await expect('reception', 'GET', '/api/academy/enrollments', 200);
    await expect('reception', 'GET', '/api/academy/attendance', 200);
    await expect('reception', 'GET', '/api/academy/users?kind=student', 200);
    await expect('reception', 'GET', '/api/academy/users?kind=staff', 403);
    await expect('reception', 'GET', '/api/academy/payments', 403);
    await expect('reception', 'GET', '/api/academy/assessments?type=assignment', 403);
    await expect('reception', 'POST', '/api/academy/branches', 403, {
      name: 'Forbidden branch',
      code: 'NOPE'
    });
    await expect('reception', 'POST', '/api/academy/attendance', 400, {
      studentId: String(unEnrolledStudent._id),
      courseId: String(course._id),
      date: new Date().toISOString(),
      status: 'present'
    });

    // Branch manager: operational data, but cannot create branches or access finance.
    await expect('branch_manager', 'GET', '/api/academy/branches', 200);
    await expect('branch_manager', 'GET', '/api/academy/groups', 200);
    await expect('branch_manager', 'GET', '/api/academy/enrollments', 200);
    await expect('branch_manager', 'GET', '/api/academy/attendance', 200);
    await expect('branch_manager', 'POST', '/api/academy/branches', 403, {
      name: 'Forbidden branch',
      code: 'NOPE2'
    });
    await expect('branch_manager', 'GET', '/api/academy/payments', 403);
    await expect('branch_manager', 'GET', '/api/academy/reports', 403);
    await expect('branch_manager', 'GET', '/api/academy/users?kind=staff', 403);

    // Content manager: content and certificates, but never pricing or finance.
    await expect('content_manager', 'GET', '/api/academy/courses', 200);
    await expect('content_manager', 'GET', '/api/academy/lessons', 200);
    await expect('content_manager', 'GET', '/api/academy/assessments?type=assignment', 200);
    await expect('content_manager', 'GET', '/api/academy/certificates', 200);
    await expect('content_manager', 'GET', '/api/academy/payments', 403);
    await expect('content_manager', 'GET', '/api/academy/users?kind=student', 403);
    await expect('content_manager', 'GET', '/api/academy/users?kind=instructor', 200);
    await expect('content_manager', 'POST', '/api/academy/courses', 403, {
      title: 'Priced by content manager',
      price: 99
    });
    await expect('content_manager', 'PATCH', '/api/academy/courses/' + course._id, 403, {
      price: 999
    });
    const contentCourse = await expect('content_manager', 'POST', '/api/academy/courses', 201, {
      title: 'Content-only course',
      description: 'No pricing privilege'
    });
    assert.strictEqual(Number(contentCourse.body.price), 0);

    // Certificate issuance is limited to students actually enrolled in the course.
    await expect('content_manager', 'POST', '/api/academy/certificates', 400, {
      studentId: String(unEnrolledStudent._id),
      courseId: String(course._id)
    });
    await expect('content_manager', 'POST', '/api/academy/certificates', 201, {
      studentId: String(users.student._id),
      courseId: String(course._id)
    });

    // Owners/admins retain administrative access.
    await expect('owner', 'POST', '/api/academy/branches', 201, {
      name: 'Owner Branch',
      code: 'OWNER-BR'
    });
    await expect('admin', 'POST', '/api/academy/branches', 201, {
      name: 'Admin Branch',
      code: 'ADMIN-BR'
    });
    await expect('owner', 'GET', '/api/academy/settings', 200);
    await expect('admin', 'GET', '/api/academy/settings', 200);
    await expect('owner', 'GET', '/api/academy/payments', 200);
    const ownerDashboard = await expect('owner', 'GET', '/api/academy/dashboard', 200);
    assert(ownerDashboard.body.upcomingSessions.length >= 1);
    assert(ownerDashboard.body.upcomingSessions[0].zoomJoinUrl);

    console.log('RBAC regression tests passed.');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

main()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async err => {
    console.error(err);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
