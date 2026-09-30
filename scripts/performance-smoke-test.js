require('./test-safety').assertSafeTestUri();
const assert = require('assert');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const Academy = require('../src/models/Academy');
const { CURRENT_LEGAL_VERSION } = require('../src/config/legal');
const User = require('../src/models/User');
const Course = require('../src/models/Course');
const academyRoutes = require('../src/routes/academy.routes');

async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');
  for (let i = 0; i < 20; i += 1) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 1000 });
      return;
    } catch (err) {
      if (i === 19) throw err;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

function p95(values) {
  const sorted = [...values].sort((a,b) => a-b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] || 0;
}

async function main() {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET ||
    'performance-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz-ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  await connect();
  await require('./test-safety').safeDropDatabase(mongoose.connection);

  const hash = await bcrypt.hash('PerformancePassword123!', 4);
  const academy = await Academy.create({
    code: 'PERF-A',
    name: 'Performance Academy',
    slug: 'performance-academy',
    status: 'active'
  });
  const owner = await User.create({
    academyId: academy._id,
    name: 'Performance Owner',
    email: 'performance-owner@example.test',
    passwordHash: hash,
    role: 'owner',
    active: true,
    legalAcceptance: {
      termsVersion: CURRENT_LEGAL_VERSION,
      privacyVersion: CURRENT_LEGAL_VERSION,
      dpaVersion: CURRENT_LEGAL_VERSION,
      acceptedAt: new Date()
    }
  });

  await Course.insertMany(
    Array.from({length: 20}, (_,i) => ({
      academyId: academy._id,
      title: 'Course ' + i,
      code: 'PERF-' + i,
      status: 'active'
    }))
  );

  const token = jwt.sign({
    sub: String(owner._id),
    role: 'owner',
    academyId: String(academy._id),
    branchId: null
  }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h'
  });

  const app = express();
  app.use(express.json());
  app.use('/api/academy', academyRoutes);
  app.use((err, req, res, next) => {
    res.status(Number(err.status || 500)).json({message: err.message || 'error'});
  });

  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  const url = 'http://127.0.0.1:' + server.address().port + '/api/academy/dashboard';
  const total = 80;
  const concurrency = 8;
  const times = [];
  let failures = 0;
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= total) return;
      const start = performance.now();
      const response = await fetch(url, {
        headers: {Authorization: 'Bearer ' + token}
      }).catch(() => null);
      times.push(performance.now() - start);
      if (!response || !response.ok) failures += 1;
      if (response) await response.arrayBuffer();
    }
  }

  try {
    await Promise.all(Array.from({length: concurrency}, () => worker()));
    const latency = p95(times);
    const limit = Number(process.env.PERFORMANCE_P95_MS || 2500);

    console.log(JSON.stringify({
      requests: total,
      concurrency,
      failures,
      p95Ms: Math.round(latency),
      limitMs: limit
    }));

    assert.strictEqual(failures, 0);
    assert(latency <= limit, 'P95 latency exceeded limit');
    console.log('Performance smoke test passed.');
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
