const assert = require('assert');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const Academy = require('../src/models/Academy');
const User = require('../src/models/User');
const backupService = require('../src/services/backup.service');

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
  process.env.BACKUP_ENCRYPTION_KEY = process.env.BACKUP_ENCRYPTION_KEY ||
    'backup-regression-encryption-key-0123456789-abcdefghijklmnopqrstuvwxyz';

  await connectWithRetry();
  await mongoose.connection.db.dropDatabase();

  const academy = await Academy.create({
    code: 'BACKUP-A',
    name: 'Backup Academy',
    slug: 'backup-academy',
    status: 'active',
    subscriptionEndsAt: new Date('2030-01-02T03:04:05.000Z')
  });

  const passwordHash = await bcrypt.hash('BackupRegressionPassword123!', 4);

  const user = await User.create({
    academyId: academy._id,
    name: 'Backup User',
    email: 'backup-user@example.test',
    passwordHash,
    role: 'student',
    active: true
  });

  const originalAcademyId = String(academy._id);
  const originalUserId = String(user._id);

  const backup = await backupService.createBackup({ reason: 'regression-test' });

  assert(backup.id);
  assert(backup.sha256);
  assert.strictEqual(backup.storage, 'mongodb-gridfs');
  assert(backup.documentCount >= 2);
  assert(backup.collectionCount >= 2);

  const validation = await backupService.validateBackup(backup.id);
  assert.strictEqual(validation.metadata.id, backup.id);
  assert(validation.payload.data);

  await Academy.updateOne(
    { _id: academy._id },
    {
      $set: {
        name: 'MUTATED AFTER BACKUP',
        subscriptionEndsAt: new Date('2040-12-31T23:59:59.000Z')
      }
    }
  );

  await User.deleteOne({ _id: user._id });

  const extraAcademy = await Academy.create({
    code: 'BACKUP-EXTRA',
    name: 'Extra Academy',
    slug: 'backup-extra',
    status: 'trial'
  });

  const restore = await backupService.restoreBackup(backup.id);

  assert.strictEqual(restore.restored.id, backup.id);
  assert(restore.safetyBackup.id);
  assert.notStrictEqual(restore.safetyBackup.id, backup.id);
  assert(restore.restoredDocuments >= 2);

  const restoredAcademy = await Academy.findById(originalAcademyId).lean();
  const restoredUser = await User.findById(originalUserId).lean();

  assert(restoredAcademy);
  assert(restoredUser);
  assert.strictEqual(restoredAcademy.name, 'Backup Academy');
  assert(restoredAcademy._id instanceof mongoose.Types.ObjectId);
  assert(restoredAcademy.subscriptionEndsAt instanceof Date);
  assert.strictEqual(
    restoredAcademy.subscriptionEndsAt.toISOString(),
    '2030-01-02T03:04:05.000Z'
  );
  assert(restoredUser._id instanceof mongoose.Types.ObjectId);
  assert.strictEqual(String(restoredUser.academyId), originalAcademyId);

  assert.strictEqual(await Academy.exists({ _id: extraAcademy._id }), null);

  const backups = await backupService.listBackups();
  assert(backups.some(row => row.id === backup.id));
  assert(backups.some(row => row.id === restore.safetyBackup.id));

  const storage = await backupService.storageStatus();
  assert.strictEqual(storage.writable, true);
  assert.strictEqual(storage.explicitlyConfigured, true);
  assert.strictEqual(storage.provider, 'mongodb-gridfs');

  await assert.rejects(
    () => backupService.validateBackup('../etc/passwd'),
    err => err && err.status === 400
  );

  const corrupt = await backupService.createBackup({ reason: 'corruption-test' });
  await mongoose.connection.db.collection('academyflow_backup_records').updateOne(
    { id: corrupt.id },
    { $set: { sha256: '0'.repeat(64) } }
  );

  await assert.rejects(
    () => backupService.validateBackup(corrupt.id),
    err => err && err.status === 409
  );

  console.log('MongoDB GridFS backup and restore regression tests passed.');
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
