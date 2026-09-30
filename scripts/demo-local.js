const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
let server, db;
async function start() {
  // Never load .env or use an existing database/production integration in this demo.
  process.env.NODE_ENV = 'development';
  process.env.ACADEMYFLOW_ISOLATED_DEMO = 'true';
  process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
  process.env.BACKUP_ENCRYPTION_KEY = crypto.randomBytes(48).toString('hex');
  for (const variable of ['SENDGRID_API_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'WHATSAPP_ACCESS_TOKEN', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'EXTERNAL_BACKUP_ACCESS_KEY_ID', 'SUPERADMIN_PASSWORD']) process.env[variable] = '';
  process.env.PAYMENTS_ENABLED = 'false'; process.env.AUTO_BACKUP_ENABLED = 'false'; process.env.MONITORING_ENABLED = 'false';
  db = await MongoMemoryReplSet.create({ binary: { downloadDir: path.join(require('./work-directory'), 'mongodb-binaries') }, replSet: { count: 1, storageEngine: 'wiredTiger' } });
  process.env.MONGODB_URI = db.getUri('academyflow_demo');
  await mongoose.connect(process.env.MONGODB_URI);
  const Academy = require('../src/models/Academy'), User = require('../src/models/User');
  const password = 'DemoOwner123!';
  const { CURRENT_LEGAL_VERSION } = require('../src/config/legal');
  const academy = await Academy.create({ code: 'DEMO-001', name: 'AcademyFlow Demo', slug: 'academyflow-demo', status: 'active' });
  const owner = await User.create({ academyId: academy._id, name: 'Demo Owner', role: 'owner', email: 'owner@example.test', passwordHash: await bcrypt.hash(password, 12),
    legalAcceptance: { acceptedAt: new Date(), termsVersion: CURRENT_LEGAL_VERSION, privacyVersion: CURRENT_LEGAL_VERSION, dpaVersion: CURRENT_LEGAL_VERSION } });
  const instructor = await User.create({ academyId: academy._id, name: 'Demo Instructor', role: 'instructor', email: 'instructor@example.test', passwordHash: await bcrypt.hash(password, 12) });
  const student = await User.create({ academyId: academy._id, name: 'Demo Student', role: 'student', email: 'student@example.test', passwordHash: await bcrypt.hash(password, 12) });
  const course = await require('../src/models/Course').create({ academyId: academy._id, title: 'AcademyFlow Demo Course', instructorId: instructor._id, status: 'active', price: 25 });
  await require('../src/models/Enrollment').create({ academyId: academy._id, studentId: student._id, courseId: course._id });
  await require('../src/models/Payment').create({ academyId: academy._id, studentId: student._id, courseId: course._id, amount: 25, currency: 'USD', status: 'pending' });
  const app = require('../src/server').app;
  server = app.listen(Number(process.env.DEMO_PORT || 0), '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  process.env.ALLOWED_ORIGINS = url; process.env.PUBLIC_URL = url;
  console.log(JSON.stringify({ url, academyCode: academy.code, email: owner.email, password, temporaryDatabase: true }));
}
async function stop() {
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect(); if (db) await db.stop();
}
process.on('SIGINT', () => stop().finally(() => process.exit()));
process.on('SIGTERM', () => stop().finally(() => process.exit()));
start().catch(err => { console.error(err); stop().finally(() => { process.exitCode = 1; }); });
