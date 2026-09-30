require('./test-safety').assertSafeTestUri();
const assert = require('assert');
const mongoose = require('mongoose');

const SystemAlert = require('../src/models/SystemAlert');
const SystemError = require('../src/models/SystemError');
const backupService = require('../src/services/backup.service');
const monitor = require('../src/services/system-monitor.service');

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

async function main() {
  process.env.NODE_ENV = 'test';
  process.env.MONITORING_ENABLED = 'true';
  process.env.ERROR_ALERT_THRESHOLD = '2';
  process.env.ERROR_ALERT_WINDOW_MINUTES = '15';
  process.env.BACKUP_STALE_HOURS = '30';
  process.env.BACKUP_ENCRYPTION_KEY =
    'monitor-test-encryption-key-0123456789-abcdefghijklmnopqrstuvwxyz';

  delete process.env.SENDGRID_API_KEY;
  delete process.env.SENDGRID_FROM_EMAIL;
  delete process.env.ALERT_EMAIL;
  delete process.env.SUPERADMIN_EMAIL;

  await connectWithRetry();
  await require('./test-safety').safeDropDatabase(mongoose.connection);

  const firstIssues = await monitor.run();
  const firstKeys = new Set(firstIssues.map(row => row.key));

  assert(firstKeys.has('backup.missing'));
  assert(firstKeys.has('email.not_configured'));

  let backupAlert = await SystemAlert.findOne({ key: 'backup.missing' });
  assert(backupAlert);
  assert.strictEqual(backupAlert.active, true);

  await backupService.createBackup({ reason: 'monitor-regression' });
  await monitor.run();

  backupAlert = await SystemAlert.findOne({ key: 'backup.missing' });
  assert(backupAlert);
  assert.strictEqual(backupAlert.active, false);
  assert(backupAlert.resolvedAt instanceof Date);

  const storage = await backupService.storageStatus();
  assert.strictEqual(storage.provider, 'mongodb-gridfs');
  assert.strictEqual(storage.writable, true);

  await SystemError.create([
    {
      status: 500,
      method: 'GET',
      path: '/api/test/one',
      message: 'regression error one'
    },
    {
      status: 500,
      method: 'POST',
      path: '/api/test/two',
      message: 'regression error two'
    }
  ]);

  const errorIssues = await monitor.run();
  assert(errorIssues.some(row => row.key === 'server.errors_spike'));

  let errorAlert = await SystemAlert.findOne({ key: 'server.errors_spike' });
  assert(errorAlert);
  assert.strictEqual(errorAlert.active, true);

  await SystemError.deleteMany({});
  await monitor.run();

  errorAlert = await SystemAlert.findOne({ key: 'server.errors_spike' });
  assert(errorAlert);
  assert.strictEqual(errorAlert.active, false);

  const emailAlert = await SystemAlert.findOne({ key: 'email.not_configured' });
  assert(emailAlert);
  assert.strictEqual(emailAlert.active, true);

  console.log('Monitoring alert regression tests passed with MongoDB storage.');
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
