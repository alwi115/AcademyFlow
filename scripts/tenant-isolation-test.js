const assert = require('assert');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const Academy = require('../src/models/Academy');
const User = require('../src/models/User');
const Course = require('../src/models/Course');
const Group = require('../src/models/Group');
const Enrollment = require('../src/models/Enrollment');
const Attendance = require('../src/models/Attendance');

const { auth } = require('../src/middleware/auth');
const academyController = require('../src/controllers/academy.controller');
const instructorTeaching = require('../src/controllers/instructor-teaching.controller');

function mockResponse() {
  return {
    statusCode: 200,
    body: undefined,
    clearedCookies: [],
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    clearCookie(name) {
      this.clearedCookies.push(name);
      return this;
    }
  };
}

async function callController(fn, req) {
  const res = mockResponse();

  try {
    await fn(req, res);
  } catch (err) {
    if (!err?.status) throw err;
    res.status(err.status).json({ message: err.message });
  }

  return res;
}

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

async function expectAuth(token, expectedStatus, shouldCallNext) {
  const req = {
    headers: { authorization: `Bearer ${token}` }
  };
  const res = mockResponse();
  let nextCalled = false;
  let nextError = null;

  await auth(req, res, err => {
    nextCalled = true;
    nextError = err || null;
  });

  if (nextError) throw nextError;
  assert.strictEqual(res.statusCode, expectedStatus);
  assert.strictEqual(nextCalled, shouldCallNext);
  return { req, res };
}

async function main() {
  process.env.JWT_SECRET = process.env.JWT_SECRET ||
    'tenant-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz-ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  await connectWithRetry();
  await mongoose.connection.db.dropDatabase();

  const passwordHash = await bcrypt.hash('StrongTestPassword123!', 4);

  const academyA = await Academy.create({
    code: 'TENANT-A',
    name: 'Tenant A',
    slug: 'tenant-a',
    status: 'active'
  });

  const academyB = await Academy.create({
    code: 'TENANT-B',
    name: 'Tenant B',
    slug: 'tenant-b',
    status: 'active'
  });

  const instructorA = await User.create({
    academyId: academyA._id,
    name: 'Instructor A',
    email: 'instructor-a@example.test',
    passwordHash,
    role: 'instructor',
    active: true
  });

  const studentA = await User.create({
    academyId: academyA._id,
    name: 'Student A',
    email: 'student-a@example.test',
    passwordHash,
    role: 'student',
    active: true
  });

  const studentB = await User.create({
    academyId: academyB._id,
    name: 'Student B',
    email: 'student-b@example.test',
    passwordHash,
    role: 'student',
    active: true
  });

  const courseA = await Course.create({
    academyId: academyA._id,
    title: 'Course A',
    code: 'COURSE-A',
    instructorId: instructorA._id,
    status: 'active'
  });

  const courseB = await Course.create({
    academyId: academyB._id,
    title: 'Course B',
    code: 'COURSE-B',
    status: 'active'
  });

  const groupA = await Group.create({
    academyId: academyA._id,
    courseId: courseA._id,
    instructorId: instructorA._id,
    name: 'Group A',
    status: 'active'
  });

  const groupB = await Group.create({
    academyId: academyB._id,
    courseId: courseB._id,
    name: 'SECRET GROUP B',
    status: 'active'
  });

  await Enrollment.create({
    academyId: academyA._id,
    studentId: studentA._id,
    courseId: courseA._id,
    groupId: groupA._id,
    status: 'active'
  });

  // Baseline: academy A must only list its own course.
  const courseList = await callController(academyController.listCourses, {
    academyId: String(academyA._id),
    user: { sub: String(instructorA._id), role: 'admin', academyId: String(academyA._id) },
    query: {}
  });
  assert.strictEqual(courseList.statusCode, 200);
  assert.strictEqual(courseList.body.length, 1);
  assert.strictEqual(String(courseList.body[0]._id), String(courseA._id));

  // Academy A must not enroll its student into a group from academy B.
  const badEnrollment = await callController(academyController.createEnrollment, {
    academyId: String(academyA._id),
    user: { sub: String(instructorA._id), role: 'admin', academyId: String(academyA._id) },
    body: {
      studentId: String(studentA._id),
      courseId: String(courseA._id),
      groupId: String(groupB._id),
      status: 'active'
    }
  });
  assert.strictEqual(badEnrollment.statusCode, 400);

  // Academy A attendance must reject academy B's group id.
  const badAdminAttendance = await callController(academyController.createAttendance, {
    academyId: String(academyA._id),
    user: { sub: String(instructorA._id), role: 'admin', academyId: String(academyA._id) },
    body: {
      studentId: String(studentA._id),
      courseId: String(courseA._id),
      groupId: String(groupB._id),
      date: new Date().toISOString(),
      status: 'present'
    }
  });
  assert.strictEqual(badAdminAttendance.statusCode, 400);

  // Instructor attendance must reject academy B's group id.
  const badInstructorAttendance = await callController(instructorTeaching.createAttendance, {
    academyId: String(academyA._id),
    user: {
      sub: String(instructorA._id),
      role: 'instructor',
      academyId: String(academyA._id)
    },
    body: {
      studentId: String(studentA._id),
      courseId: String(courseA._id),
      groupId: String(groupB._id),
      date: new Date().toISOString(),
      status: 'present'
    }
  });
  assert.strictEqual(badInstructorAttendance.statusCode, 400);

  // Simulate a legacy poisoned row created before the fix. Tenant-scoped
  // populate must not reveal the foreign group's name.
  await Attendance.create({
    academyId: academyA._id,
    studentId: studentA._id,
    courseId: courseA._id,
    groupId: groupB._id,
    date: new Date(),
    status: 'present'
  });

  const instructorAttendance = await callController(instructorTeaching.attendance, {
    academyId: String(academyA._id),
    user: {
      sub: String(instructorA._id),
      role: 'instructor',
      academyId: String(academyA._id)
    },
    query: { courseId: String(courseA._id) }
  });
  assert.strictEqual(instructorAttendance.statusCode, 200);
  assert.strictEqual(instructorAttendance.body.length, 1);
  assert.strictEqual(instructorAttendance.body[0].groupId, null);

  const academyAttendance = await callController(academyController.listAttendance, {
    academyId: String(academyA._id),
    user: {
      sub: String(instructorA._id),
      role: 'admin',
      academyId: String(academyA._id)
    },
    query: { courseId: String(courseA._id) }
  });
  assert.strictEqual(academyAttendance.statusCode, 200);
  assert.strictEqual(academyAttendance.body.length, 1);
  assert.strictEqual(academyAttendance.body[0].groupId, null);

  // Student from tenant B must never be accepted as tenant A's student.
  const foreignStudentAttendance = await callController(academyController.createAttendance, {
    academyId: String(academyA._id),
    user: { sub: String(instructorA._id), role: 'admin', academyId: String(academyA._id) },
    body: {
      studentId: String(studentB._id),
      courseId: String(courseA._id),
      date: new Date().toISOString(),
      status: 'present'
    }
  });
  assert.strictEqual(foreignStudentAttendance.statusCode, 400);

  // A signed token is valid while its DB role/tenant scope is unchanged.
  const token = jwt.sign(
    {
      sub: String(instructorA._id),
      role: 'instructor',
      academyId: String(academyA._id)
    },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  );

  const validAuth = await expectAuth(token, 200, true);
  assert.strictEqual(validAuth.req.user.role, 'instructor');
  assert.strictEqual(validAuth.req.user.academyId, String(academyA._id));

  // Role changes invalidate the old token instead of silently granting the
  // session its new role.
  instructorA.role = 'admin';
  await instructorA.save();
  await expectAuth(token, 401, false);

  instructorA.role = 'instructor';
  await instructorA.save();

  // Tenant moves invalidate the old token, preventing stale access to A and
  // preventing automatic access to B.
  instructorA.academyId = academyB._id;
  await instructorA.save();
  await expectAuth(token, 401, false);

  // Disabled accounts invalidate existing tokens immediately.
  instructorA.academyId = academyA._id;
  instructorA.active = false;
  await instructorA.save();
  await expectAuth(token, 401, false);

  console.log('Tenant isolation regression tests passed.');
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
