const assert = require('assert');
const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const Academy = require('../src/models/Academy');
const User = require('../src/models/User');
const PrivacyRequest = require('../src/models/PrivacyRequest');
const SystemSetting = require('../src/models/SystemSetting');
const publicRoutes = require('../src/routes/public.routes');
const superadminRoutes = require('../src/routes/superadmin.routes');
const authRoutes = require('../src/routes/auth.routes');
const academyRoutes = require('../src/routes/academy.routes');
const { CURRENT_LEGAL_VERSION } = require('../src/config/legal');

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
  return jwt.sign({
    sub: String(user._id),
    role: user.role,
    academyId: user.academyId ? String(user.academyId) : null,
    branchId: user.branchId ? String(user.branchId) : null
  }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h'
  });
}

async function main() {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET ||
    'legal-readiness-secret-0123456789-abcdefghijklmnopqrstuvwxyz-ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  await connectWithRetry();
  await mongoose.connection.db.dropDatabase();

  await SystemSetting.create({
    key: 'platform',
    platformName: 'AcademyFlow',
    supportEmail: 'support@example.test',
    supportPhone: '+96800000000',
    legalEntityName: 'AcademyFlow Test Entity',
    commercialRegistrationNumber: 'TEST-CR-001',
    businessAddress: 'Muscat, Oman',
    privacyOfficerEmail: 'privacy@example.test'
  });

  const hash = await bcrypt.hash('LegalAcceptancePassword123!', 4);
  const academy = await Academy.create({
    code: 'LEGAL-A',
    name: 'Legal Academy',
    slug: 'legal-academy',
    status: 'active'
  });
  const owner = await User.create({
    academyId: academy._id,
    name: 'Legal Owner',
    email: 'legal-owner@example.test',
    passwordHash: hash,
    role: 'owner',
    active: true
  });

  const superadmin = await User.create({
    academyId: null,
    name: 'Legal Super Admin',
    username: 'legal-superadmin',
    email: 'legal-superadmin@example.test',
    passwordHash: hash,
    role: 'superadmin',
    active: true
  });

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api/public', publicRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/superadmin', superadminRoutes);
  app.use('/api/academy', academyRoutes);
  app.use((err, req, res, next) => {
    res.status(Number(err.status || 500)).json({ message: err.message || 'error' });
  });

  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  const base = 'http://127.0.0.1:' + server.address().port;
  const token = tokenFor(owner);

  try {
    const configRes = await fetch(base + '/api/public/legal-config');
    assert.strictEqual(configRes.status, 200);
    const config = await configRes.json();
    assert.strictEqual(config.legalVersion, CURRENT_LEGAL_VERSION);
    assert.strictEqual(config.legalEntityName, 'AcademyFlow Test Entity');
    assert.strictEqual(config.commercialRegistrationNumber, 'TEST-CR-001');

    const blocked = await fetch(base + '/api/academy/dashboard', {
      headers: { Authorization: 'Bearer ' + token }
    });
    assert.strictEqual(blocked.status, 428);
    const blockedBody = await blocked.json();
    assert.strictEqual(blockedBody.legalAcceptanceRequired, true);

    const csrfRes = await fetch(base + '/api/auth/csrf');
    assert.strictEqual(csrfRes.status, 200);
    const csrfBody = await csrfRes.json();
    const setCookie = csrfRes.headers.get('set-cookie') || '';
    const csrfCookie = setCookie.split(';')[0];
    assert(csrfCookie.startsWith('af_csrf='));

    const acceptRes = await fetch(base + '/api/auth/legal-acceptance', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        Origin: base,
        Cookie: csrfCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        _csrf: csrfBody.csrfToken,
        accepted: true,
        termsVersion: CURRENT_LEGAL_VERSION,
        privacyVersion: CURRENT_LEGAL_VERSION,
        dpaVersion: CURRENT_LEGAL_VERSION
      })
    });
    assert.strictEqual(acceptRes.status, 200);

    const acceptedOwner = await User.findById(owner._id).lean();
    assert.strictEqual(acceptedOwner.legalAcceptance.termsVersion, CURRENT_LEGAL_VERSION);
    assert(acceptedOwner.legalAcceptance.acceptedAt instanceof Date);

    const allowed = await fetch(base + '/api/academy/dashboard', {
      headers: { Authorization: 'Bearer ' + token }
    });
    assert.strictEqual(allowed.status, 200);

    const privacyRes = await fetch(base + '/api/public/privacy-requests', {
      method: 'POST',
      headers: {
        Origin: base,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'deletion',
        name: 'Privacy User',
        email: 'privacy-user@example.test',
        academyCode: 'LEGAL-A',
        details: 'Delete my test data.'
      })
    });
    assert.strictEqual(privacyRes.status, 201);
    const privacyBody = await privacyRes.json();
    assert(/^PR-\d{8}-[A-F0-9]{8}$/.test(privacyBody.requestNumber));
    assert(await PrivacyRequest.exists({ requestNumber: privacyBody.requestNumber }));

    const superToken = tokenFor(superadmin);

    const activitiesRes = await fetch(base + '/api/superadmin/compliance/processing-activities', {
      headers: { Authorization: 'Bearer ' + superToken }
    });
    assert.strictEqual(activitiesRes.status, 200);
    const activities = await activitiesRes.json();
    assert(activities.length >= 8);
    assert(activities.some(row => row.key === 'encrypted-backups'));
    assert(activities.some(row => row.key === 'security-audit-monitoring'));

    const incidentRes = await fetch(base + '/api/superadmin/compliance/incidents', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + superToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Legal regression privacy incident',
        description: 'Regression-only incident record.',
        riskLevel: 'high',
        rightsRisk: true,
        highRiskToSubjects: true,
        authorityNotificationRequired: true,
        subjectsNotificationRequired: true,
        dataCategories: 'email\nattendance'
      })
    });
    assert.strictEqual(incidentRes.status, 201);
    const incident = await incidentRes.json();
    assert(/^INC-\d{8}-[A-F0-9]{8}$/.test(incident.incidentNumber));
    assert.strictEqual(incident.rightsRisk, true);

    const incidentListRes = await fetch(base + '/api/superadmin/compliance/incidents', {
      headers: { Authorization: 'Bearer ' + superToken }
    });
    assert.strictEqual(incidentListRes.status, 200);
    const incidentList = await incidentListRes.json();
    assert(incidentList.some(row => row.incidentNumber === incident.incidentNumber));

    const crossSite = await fetch(base + '/api/public/privacy-requests', {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'access',
        name: 'Blocked User',
        email: 'blocked@example.test'
      })
    });
    assert.strictEqual(crossSite.status, 403);

    const legalFiles = [
      'index.html',
      'privacy.html',
      'terms.html',
      'refund.html',
      'data-deletion.html',
      'cookies.html',
      'acceptable-use.html',
      'support.html',
      'dpa.html',
      'privacy-request.html'
    ];

    for (const file of legalFiles) {
      const content = await fs.readFile(
        path.join(process.cwd(), 'public', 'legal', file),
        'utf8'
      );
      assert(content.includes('/css/legal.css'));
      assert(content.includes('/js/legal.js'));
      assert(!/onclick\s*=\s*/i.test(content));
    }

    const acceptancePage = await fs.readFile(
      path.join(process.cwd(), 'public', 'academy', 'legal-acceptance.html'),
      'utf8'
    );
    assert(acceptancePage.includes('legalAcceptanceForm'));
    assert(!/onclick\s*=\s*/i.test(acceptancePage));

    console.log('Legal readiness regression tests passed.');
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
