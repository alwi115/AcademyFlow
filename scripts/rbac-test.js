const assert = require('assert');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const Academy = require('../src/models/Academy');
const User = require('../src/models/User');
const Course = require('../src/models/Course');
const Branch = require('../src/models/Branch');
const Group = require('../src/models/Group');
const Enrollment = require('../src/models/Enrollment');
const Assessment = require('../src/models/Assessment');
const QuizAttempt = require('../src/models/QuizAttempt');
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
      academyId: user.academyId ? String(user.academyId) : null,
      branchId: user.branchId ? String(user.branchId) : null
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

  const branchA = await Branch.create({
    academyId: academy._id,
    name: 'Branch A',
    code: 'BR-A',
    city: 'Salalah',
    active: true
  });

  const branchB = await Branch.create({
    academyId: academy._id,
    name: 'Branch B',
    code: 'BR-B',
    city: 'Muscat',
    active: true
  });

  async function makeUser(role, name, branchId = null) {
    return User.create({
      academyId: academy._id,
      branchId,
      name,
      email: role + '-' + Date.now() + '-' + Math.random().toString(16).slice(2) + '@example.test',
      passwordHash,
      role,
      active: true
    });
  }

  const users = {};
  for (const role of [
    'owner','admin','accountant','reception',
    'content_manager','support','instructor','student'
  ]) {
    users[role] = await makeUser(role, role);
  }

  users.branch_manager = await makeUser('branch_manager', 'branch_manager', branchA._id);
  users.group_instructor = await makeUser('instructor', 'Group-only Instructor');

  const groupOnlyStudent = await makeUser('student', 'Group-only Student');
  const otherGroupStudent = await makeUser('student', 'Other Group Student');
  const unEnrolledStudent = await makeUser('student', 'Unenrolled student');
  const branchBInstructor = await makeUser('instructor', 'Branch B Instructor');
  const branchBStudent = await makeUser('student', 'Branch B Student');

  const course = await Course.create({
    academyId: academy._id,
    title: 'RBAC Course A',
    code: 'RBAC-COURSE-A',
    instructorId: users.instructor._id,
    price: 25,
    status: 'active'
  });

  const courseB = await Course.create({
    academyId: academy._id,
    title: 'RBAC Course B',
    code: 'RBAC-COURSE-B',
    instructorId: branchBInstructor._id,
    price: 30,
    status: 'active'
  });

  const group = await Group.create({
    academyId: academy._id,
    branchId: branchA._id,
    courseId: course._id,
    instructorId: users.instructor._id,
    name: 'RBAC Group A',
    status: 'active'
  });

  const groupB = await Group.create({
    academyId: academy._id,
    branchId: branchB._id,
    courseId: courseB._id,
    instructorId: branchBInstructor._id,
    name: 'RBAC Group B',
    status: 'active'
  });

  const groupOnly = await Group.create({
    academyId: academy._id,
    branchId: branchA._id,
    courseId: course._id,
    instructorId: users.group_instructor._id,
    name: 'Group-only Instructor Group',
    status: 'active'
  });

  const otherCourseGroup = await Group.create({
    academyId: academy._id,
    branchId: branchA._id,
    courseId: course._id,
    instructorId: users.instructor._id,
    name: 'Other Group Same Course',
    status: 'active'
  });

  await Enrollment.create({
    academyId: academy._id,
    studentId: users.student._id,
    courseId: course._id,
    groupId: group._id,
    status: 'active'
  });

  await Enrollment.create({
    academyId: academy._id,
    studentId: branchBStudent._id,
    courseId: courseB._id,
    groupId: groupB._id,
    status: 'active'
  });

  await Enrollment.create({
    academyId: academy._id,
    studentId: groupOnlyStudent._id,
    courseId: course._id,
    groupId: groupOnly._id,
    status: 'active'
  });

  await Enrollment.create({
    academyId: academy._id,
    studentId: otherGroupStudent._id,
    courseId: course._id,
    groupId: otherCourseGroup._id,
    status: 'active'
  });

  const quiz = await Assessment.create({
    academyId: academy._id,
    courseId: course._id,
    type: 'quiz',
    title: 'RBAC Quiz',
    totalMarks: 10,
    passingMark: 5,
    durationMinutes: 30,
    maxAttempts: 2,
    passingPercentage: 50,
    status: 'draft'
  });

  const quizAttempt = await QuizAttempt.create({
    academyId: academy._id,
    assessmentId: quiz._id,
    courseId: course._id,
    studentId: users.student._id,
    attemptNumber: 1,
    status: 'pending_review',
    totalMarks: 10,
    score: 0,
    percentage: 0,
    requiresManualReview: true
  });

  const groupOnlyQuizAttempt = await QuizAttempt.create({
    academyId: academy._id,
    assessmentId: quiz._id,
    courseId: course._id,
    studentId: groupOnlyStudent._id,
    attemptNumber: 1,
    status: 'pending_review',
    totalMarks: 10,
    score: 0,
    percentage: 0,
    requiresManualReview: true
  });

  await LiveSession.create({
    academyId: academy._id,
    courseId: course._id,
    groupId: group._id,
    title: 'RBAC Live A',
    instructorId: users.instructor._id,
    startAt: new Date(Date.now() + 60 * 60 * 1000),
    zoomJoinUrl: 'https://zoom.example.test/join/secret-a',
    status: 'scheduled'
  });

  await LiveSession.create({
    academyId: academy._id,
    courseId: courseB._id,
    groupId: groupB._id,
    title: 'RBAC Live B',
    instructorId: branchBInstructor._id,
    startAt: new Date(Date.now() + 90 * 60 * 1000),
    zoomJoinUrl: 'https://zoom.example.test/join/secret-b',
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

    // Group-only instructors can work with their group, but never inherit whole-course data or write privileges.
    const scopedStudents = await expect('group_instructor', 'GET', '/api/instructor/students', 200);
    assert.strictEqual(scopedStudents.body.length, 1);
    assert.strictEqual(String(scopedStudents.body[0].studentId._id), String(groupOnlyStudent._id));

    const scopedGroups = await expect('group_instructor', 'GET', '/api/instructor/groups', 200);
    assert.strictEqual(scopedGroups.body.length, 1);
    assert.strictEqual(String(scopedGroups.body[0]._id), String(groupOnly._id));

    const scopedGradebook = await expect('group_instructor', 'GET', '/api/instructor/gradebook', 200);
    assert.strictEqual(scopedGradebook.body.length, 1);
    assert.strictEqual(String(scopedGradebook.body[0].student._id), String(groupOnlyStudent._id));

    const scopedAttempts = await expect(
      'group_instructor',
      'GET',
      '/api/instructor/quizzes/' + quiz._id + '/attempts',
      200
    );
    assert.strictEqual(scopedAttempts.body.length, 1);
    assert.strictEqual(String(scopedAttempts.body[0].student._id), String(groupOnlyStudent._id));

    await expect(
      'group_instructor',
      'GET',
      '/api/instructor/quizzes/' + quiz._id + '/attempts/' + quizAttempt._id,
      404
    );

    await expect('group_instructor', 'POST', '/api/instructor/lessons', 403, {
      courseId: String(course._id),
      title: 'Forbidden group-level lesson'
    });

    await expect('group_instructor', 'POST', '/api/instructor/assignments', 403, {
      courseId: String(course._id),
      title: 'Forbidden group-level assignment'
    });

    await expect('group_instructor', 'POST', '/api/instructor/quizzes', 403, {
      courseId: String(course._id),
      title: 'Forbidden group-level quiz'
    });

    await expect('group_instructor', 'POST', '/api/instructor/notifications', 403, {
      courseId: String(course._id),
      title: 'Forbidden course announcement',
      message: 'Should not reach the whole course'
    });

    await expect('group_instructor', 'POST', '/api/instructor/attendance', 403, {
      studentId: String(otherGroupStudent._id),
      courseId: String(course._id),
      groupId: String(otherCourseGroup._id),
      date: new Date().toISOString(),
      status: 'present'
    });

    await expect('group_instructor', 'POST', '/api/instructor/attendance', 201, {
      studentId: String(groupOnlyStudent._id),
      courseId: String(course._id),
      groupId: String(groupOnly._id),
      date: new Date().toISOString(),
      status: 'present'
    });

    await expect('group_instructor', 'POST', '/api/instructor/live', 403, {
      courseId: String(course._id),
      title: 'Forbidden course-wide live',
      startAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    });

    await expect('group_instructor', 'POST', '/api/instructor/live', 403, {
      courseId: String(course._id),
      groupId: String(otherCourseGroup._id),
      title: 'Forbidden other-group live',
      startAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    });

    const ownGroupLive = await expect('group_instructor', 'POST', '/api/instructor/live', 201, {
      courseId: String(course._id),
      groupId: String(groupOnly._id),
      title: 'Allowed own-group live',
      startAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    });
    assert.strictEqual(String(ownGroupLive.body.group._id), String(groupOnly._id));

    // The direct course instructor retains full course-level content rights.
    await expect('instructor', 'POST', '/api/instructor/lessons', 201, {
      courseId: String(course._id),
      title: 'Direct instructor lesson'
    });

    await expect('instructor', 'POST', '/api/instructor/notifications', 201, {
      courseId: String(course._id),
      title: 'Direct instructor announcement',
      message: 'Allowed'
    });

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

    // Branch manager: operational data is restricted to the assigned branch only.
    const branchRows = await expect('branch_manager', 'GET', '/api/academy/branches', 200);
    assert.strictEqual(branchRows.body.length, 1);
    assert.strictEqual(String(branchRows.body[0]._id), String(branchA._id));

    const branchGroups = await expect('branch_manager', 'GET', '/api/academy/groups', 200);
    const branchGroupIds = new Set(branchGroups.body.map(row => String(row._id)));
    assert(branchGroupIds.has(String(group._id)));
    assert(branchGroupIds.has(String(groupOnly._id)));
    assert(branchGroupIds.has(String(otherCourseGroup._id)));
    assert(!branchGroupIds.has(String(groupB._id)));
    assert(branchGroups.body.every(
      row => String(row.branchId?._id || row.branchId) === String(branchA._id)
    ));

    const branchEnrollments = await expect('branch_manager', 'GET', '/api/academy/enrollments', 200);
    const branchEnrollmentStudentIds = new Set(
      branchEnrollments.body.map(row => String(row.studentId?._id || row.studentId))
    );
    assert(branchEnrollmentStudentIds.has(String(users.student._id)));
    assert(branchEnrollmentStudentIds.has(String(groupOnlyStudent._id)));
    assert(branchEnrollmentStudentIds.has(String(otherGroupStudent._id)));
    assert(!branchEnrollmentStudentIds.has(String(branchBStudent._id)));

    const branchStudents = await expect('branch_manager', 'GET', '/api/academy/users?kind=student', 200);
    const branchStudentIds = new Set(branchStudents.body.map(row => String(row._id)));
    assert(branchStudentIds.has(String(users.student._id)));
    assert(branchStudentIds.has(String(groupOnlyStudent._id)));
    assert(branchStudentIds.has(String(otherGroupStudent._id)));
    assert(!branchStudentIds.has(String(branchBStudent._id)));

    const branchOptions = await expect('branch_manager', 'GET', '/api/academy/options', 200);
    assert.strictEqual(branchOptions.body.branches.length, 1);
    assert.strictEqual(branchOptions.body.courses.length, 1);
    assert.strictEqual(String(branchOptions.body.branches[0]._id), String(branchA._id));
    assert.strictEqual(String(branchOptions.body.courses[0]._id), String(course._id));
    assert(!branchOptions.body.groups.some(row => String(row._id) === String(groupB._id)));
    assert(!branchOptions.body.students.some(row => String(row._id) === String(branchBStudent._id)));

    const branchDashboard = await expect('branch_manager', 'GET', '/api/academy/dashboard', 200);
    assert.strictEqual(branchDashboard.body.groups, 3);
    assert.strictEqual(branchDashboard.body.students, 3);
    assert.strictEqual(branchDashboard.body.courses, 1);
    assert.strictEqual(branchDashboard.body.revenue, null);
    assert(branchDashboard.body.upcomingSessions.length >= 1);
    assert(branchDashboard.body.upcomingSessions.every(row => row.zoomJoinUrl === ''));
    assert(!branchDashboard.body.upcomingSessions.some(row => row.title === 'RBAC Live B'));

    await expect('branch_manager', 'POST', '/api/academy/branches', 403, {
      name: 'Forbidden branch',
      code: 'NOPE2'
    });
    await expect('branch_manager', 'GET', '/api/academy/payments', 403);
    await expect('branch_manager', 'GET', '/api/academy/reports', 403);
    await expect('branch_manager', 'GET', '/api/academy/users?kind=staff', 403);

    // Cross-branch writes must be blocked even when the manager knows object IDs.
    await expect('branch_manager', 'PATCH', '/api/academy/groups/' + groupB._id, 404, {
      name: 'Hijacked Group B'
    });

    await expect('branch_manager', 'POST', '/api/academy/groups', 403, {
      name: 'Scope escalation group',
      courseId: String(courseB._id),
      branchId: String(branchA._id),
      instructorId: String(branchBInstructor._id)
    });

    await expect('branch_manager', 'PATCH', '/api/academy/groups/' + group._id, 403, {
      courseId: String(courseB._id)
    });

    await expect('branch_manager', 'PATCH', '/api/academy/groups/' + group._id, 403, {
      instructorId: String(branchBInstructor._id)
    });

    const allowedBranchGroup = await expect('branch_manager', 'POST', '/api/academy/groups', 201, {
      name: 'Allowed Branch A Group',
      courseId: String(course._id),
      branchId: String(branchA._id),
      instructorId: String(users.instructor._id),
      status: 'active'
    });
    assert.strictEqual(String(allowedBranchGroup.body.branchId), String(branchA._id));
    await expect('branch_manager', 'POST', '/api/academy/enrollments', 403, {
      studentId: String(branchBStudent._id),
      courseId: String(courseB._id),
      groupId: String(groupB._id),
      status: 'active'
    });

    await expect('branch_manager', 'POST', '/api/academy/enrollments', 403, {
      studentId: String(branchBStudent._id),
      courseId: String(course._id),
      groupId: String(group._id),
      status: 'active'
    });
    await expect('branch_manager', 'POST', '/api/academy/attendance', 403, {
      studentId: String(branchBStudent._id),
      courseId: String(courseB._id),
      groupId: String(groupB._id),
      date: new Date().toISOString(),
      status: 'present'
    });

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

    // Content managers can build quizzes but cannot inspect student attempts or grades.
    const contentQuiz = await expect(
      'content_manager',
      'GET',
      '/api/academy/quizzes/' + quiz._id,
      200
    );
    assert.strictEqual(contentQuiz.body.hasAttempts, true);
    assert.strictEqual(contentQuiz.body.attempts.length, 0);

    await expect(
      'content_manager',
      'GET',
      '/api/academy/quizzes/' + quiz._id + '/attempts',
      403
    );

    await expect(
      'content_manager',
      'GET',
      '/api/academy/quizzes/' + quiz._id + '/attempts/' + quizAttempt._id,
      403
    );

    const ownerAttempts = await expect(
      'owner',
      'GET',
      '/api/academy/quizzes/' + quiz._id + '/attempts',
      200
    );
    assert.strictEqual(ownerAttempts.body.length, 1);

    const instructorAttempts = await expect(
      'instructor',
      'GET',
      '/api/instructor/quizzes/' + quiz._id + '/attempts',
      200
    );
    assert.strictEqual(instructorAttempts.body.length, 1);

    // Certificate issuance is limited to students actually enrolled in the course.
    await expect('content_manager', 'POST', '/api/academy/certificates', 400, {
      studentId: String(unEnrolledStudent._id),
      courseId: String(course._id)
    });
    await expect('content_manager', 'POST', '/api/academy/certificates', 201, {
      studentId: String(users.student._id),
      courseId: String(course._id)
    });

    // Privilege assignment itself is protected.
    await expect('admin', 'POST', '/api/academy/users', 403, {
      name: 'Forbidden peer admin',
      email: 'peer-admin@example.test',
      password: 'StrongPassword123!',
      role: 'admin'
    });

    await expect('admin', 'POST', '/api/academy/users', 400, {
      name: 'Unscoped branch manager',
      email: 'unscoped-manager@example.test',
      password: 'StrongPassword123!',
      role: 'branch_manager'
    });

    const scopedManager = await expect('admin', 'POST', '/api/academy/users', 201, {
      name: 'Scoped branch manager',
      email: 'scoped-manager@example.test',
      password: 'StrongPassword123!',
      role: 'branch_manager',
      branchId: String(branchA._id)
    });
    assert.strictEqual(String(scopedManager.body.branchId), String(branchA._id));

    await expect('owner', 'POST', '/api/academy/users', 201, {
      name: 'Owner-created admin',
      email: 'owner-admin@example.test',
      password: 'StrongPassword123!',
      role: 'admin'
    });

    await expect('admin', 'PATCH', '/api/academy/users/' + users.owner._id, 403, {
      name: 'Tampered owner'
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
