const assert = require('assert');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const Academy = require('../src/models/Academy');
const User = require('../src/models/User');
const AuditLog = require('../src/models/AuditLog');

const academyRoutes = require('../src/routes/academy.routes');
const instructorRoutes = require('../src/routes/instructor.routes');
const studentRoutes = require('../src/routes/student.routes');
const zoomRoutes = require('../src/routes/zoom.routes');
const auditMiddleware = require('../src/middleware/audit');

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

function tokenFor(user) {
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
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET ||
    'e2e-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz-ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  delete process.env.ZOOM_CLIENT_ID;
  delete process.env.ZOOM_CLIENT_SECRET;
  delete process.env.ZOOM_REDIRECT_URI;

  await connectWithRetry();
  await mongoose.connection.db.dropDatabase();

  const passwordHash = await bcrypt.hash('OwnerRegressionPassword123!', 4);

  const academy = await Academy.create({
    code: 'E2E-A',
    name: 'E2E Academy',
    slug: 'e2e-academy',
    currency: 'OMR',
    status: 'active'
  });

  const owner = await User.create({
    academyId: academy._id,
    name: 'E2E Owner',
    email: 'owner-e2e@example.test',
    passwordHash,
    role: 'owner',
    active: true
  });

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(auditMiddleware);
  app.use('/api/academy', academyRoutes);
  app.use('/api/instructor', instructorRoutes);
  app.use('/api/student', studentRoutes);
  app.use('/api/zoom', zoomRoutes);
  app.use((err, req, res, next) => {
    res.status(Number(err.status || 500)).json({
      message: Number(err.status || 500) >= 500 ? 'Internal server error' : err.message
    });
  });

  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  const base = 'http://127.0.0.1:' + server.address().port;

  async function request(user, method, path, body) {
    const response = await fetch(base + path, {
      method,
      headers: {
        Authorization: 'Bearer ' + tokenFor(user),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }

    if (!response.ok) {
      throw new Error(
        method + ' ' + path + ' failed with ' + response.status +
        ': ' + JSON.stringify(data)
      );
    }

    return { status: response.status, data };
  }

  try {
    const branch = (await request(owner, 'POST', '/api/academy/branches', {
      name: 'Main Branch',
      code: 'MAIN',
      city: 'Salalah'
    })).data;
    assert(branch._id);

    const instructorCreated = (await request(owner, 'POST', '/api/academy/users', {
      name: 'E2E Instructor',
      email: 'instructor-e2e@example.test',
      password: 'InstructorPassword123!',
      role: 'instructor'
    })).data;

    const studentCreated = (await request(owner, 'POST', '/api/academy/users', {
      name: 'E2E Student',
      email: 'student-e2e@example.test',
      password: 'StudentPassword123!',
      role: 'student'
    })).data;

    const [instructor, student] = await Promise.all([
      User.findById(instructorCreated.id),
      User.findById(studentCreated.id)
    ]);

    assert(instructor);
    assert(student);

    const course = (await request(owner, 'POST', '/api/academy/courses', {
      title: 'E2E Course',
      code: 'E2E-COURSE',
      instructorId: String(instructor._id),
      price: 25,
      deliveryType: 'hybrid',
      status: 'active'
    })).data;
    assert.strictEqual(course.status, 'active');

    const group = (await request(owner, 'POST', '/api/academy/groups', {
      courseId: course._id,
      branchId: branch._id,
      instructorId: String(instructor._id),
      name: 'E2E Group',
      capacity: 25,
      status: 'active'
    })).data;
    assert(group._id);

    const enrollment = (await request(owner, 'POST', '/api/academy/enrollments', {
      studentId: String(student._id),
      courseId: course._id,
      groupId: group._id,
      status: 'active'
    })).data;
    assert.strictEqual(String(enrollment.studentId), String(student._id));

    const attendance = (await request(instructor, 'POST', '/api/instructor/attendance', {
      studentId: String(student._id),
      courseId: course._id,
      groupId: group._id,
      date: new Date().toISOString(),
      status: 'present'
    })).data;
    assert.strictEqual(attendance.status, 'present');

    const quiz = (await request(owner, 'POST', '/api/academy/quizzes', {
      courseId: course._id,
      title: 'E2E Quiz',
      shuffleQuestions: false,
      shuffleOptions: false,
      showCorrectAnswers: true,
      passingPercentage: 50
    })).data;
    assert.strictEqual(quiz.status, 'draft');

    const questionResponse = (await request(
      owner,
      'POST',
      '/api/academy/quizzes/' + quiz._id + '/questions',
      {
        type: 'true_false',
        prompt: '2 + 2 = 4',
        correctBoolean: true,
        marks: 1,
        order: 1,
        explanation: 'Basic arithmetic'
      }
    )).data;

    const question = questionResponse.question;
    assert(question._id);

    const published = (await request(
      owner,
      'PATCH',
      '/api/academy/quizzes/' + quiz._id,
      { status: 'published' }
    )).data;
    assert.strictEqual(published.status, 'published');

    const started = (await request(
      student,
      'POST',
      '/api/student/quizzes/' + quiz._id + '/start'
    )).data;
    assert.strictEqual(started.questions.length, 1);
    assert.strictEqual(started.attempt.status, 'in_progress');

    const attemptId = started.attempt.id;
    const studentQuestion = started.questions[0];

    await request(
      student,
      'PATCH',
      '/api/student/quiz-attempts/' + attemptId + '/questions/' + studentQuestion.id,
      { booleanAnswer: true }
    );

    const submitted = (await request(
      student,
      'POST',
      '/api/student/quiz-attempts/' + attemptId + '/submit'
    )).data;

    assert.strictEqual(submitted.attempt.status, 'graded');
    assert.strictEqual(submitted.attempt.percentage, 100);
    assert.strictEqual(submitted.attempt.passed, true);

    const result = (await request(
      student,
      'GET',
      '/api/student/quiz-attempts/' + attemptId + '/result'
    )).data;
    assert.strictEqual(result.attempt.percentage, 100);
    assert.strictEqual(result.questions.length, 1);

    const payment = (await request(owner, 'POST', '/api/academy/payments', {
      studentId: String(student._id),
      courseId: course._id,
      amount: 12.5,
      method: 'cash',
      status: 'paid',
      reference: 'E2E-PAY-1'
    })).data;
    assert.strictEqual(payment.amount, 12.5);
    assert.strictEqual(payment.currency, 'OMR');

    const reports = (await request(owner, 'GET', '/api/academy/reports')).data;
    assert.strictEqual(reports.students, 1);
    assert.strictEqual(reports.courses, 1);
    assert.strictEqual(reports.enrollments, 1);
    assert.strictEqual(reports.revenue, 12.5);
    assert.strictEqual(reports.paidTransactions, 1);
    assert.strictEqual(reports.attendanceRate, 100);

    const zoomStatus = (await request(owner, 'GET', '/api/zoom/status')).data;
    assert.strictEqual(zoomStatus.appConfigured, false);
    assert.strictEqual(zoomStatus.connected, false);

    const studentDashboard = (await request(student, 'GET', '/api/student/dashboard')).data;
    assert(studentDashboard);

    const instructorDashboard = (await request(instructor, 'GET', '/api/instructor/dashboard')).data;
    assert.strictEqual(instructorDashboard.courses, 1);
    assert.strictEqual(instructorDashboard.students, 1);

    await new Promise(resolve => setTimeout(resolve, 100));

    const paymentAudit = await AuditLog.findOne({
      academyId: academy._id,
      action: 'academy.payment.create',
      targetId: String(payment._id)
    }).lean();

    assert(paymentAudit);
    assert.strictEqual(paymentAudit.actorRole, 'owner');
    assert.strictEqual(paymentAudit.after.amount, 12.5);
    assert(paymentAudit.requestId);

    console.log('End-to-end academy journey passed.');
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
