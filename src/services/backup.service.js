const zlib = require('zlib');
const crypto = require('crypto');
const { promisify } = require('util');
const mongoose = require('mongoose');
const { EJSON } = require('bson');
const externalBackup = require('./external-backup.service');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const BACKUP_BUCKET = 'academyflow_backups';
const BACKUP_RECORDS = 'academyflow_backup_records';
const INTERNAL_COLLECTIONS = new Set([
  BACKUP_RECORDS,
  BACKUP_BUCKET + '.files',
  BACKUP_BUCKET + '.chunks',
  'academyflow_operation_locks',
  'academyflow_auth_state',
  'academyflow_zoom_event_locks'
]);

let busy = false;
let busyOperation = '';

function explicitStorageConfigured() {
  return Boolean(String(process.env.MONGODB_URI || '').trim());
}

function encryptionConfigured() {
  return String(process.env.BACKUP_ENCRYPTION_KEY || '').length >= 32;
}

function productionReady() {
  if (process.env.NODE_ENV !== 'production') return true;
  return explicitStorageConfigured() && encryptionConfigured();
}

function ensureConnected() {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    const err = new Error('MongoDB is not connected');
    err.status = 503;
    throw err;
  }
}

function ensureProductionConfig() {
  if (process.env.NODE_ENV !== 'production') return;

  if (!explicitStorageConfigured()) {
    const err = new Error('MONGODB_URI is required for backup storage');
    err.status = 503;
    throw err;
  }

  if (!encryptionConfigured()) {
    const err = new Error('BACKUP_ENCRYPTION_KEY must be at least 32 characters in production');
    err.status = 503;
    throw err;
  }
}

function bucket() {
  ensureConnected();
  return new mongoose.mongo.GridFSBucket(
    mongoose.connection.db,
    { bucketName: BACKUP_BUCKET }
  );
}

function records() {
  ensureConnected();
  return mongoose.connection.db.collection(BACKUP_RECORDS);
}

function encryptionKey() {
  const secret = String(process.env.BACKUP_ENCRYPTION_KEY || '');
  if (secret.length < 32) return null;
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

function safeBackupId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9._-]+$/.test(id) ? id : '';
}

function timestampId(date = new Date()) {
  const iso = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `academyflow-${iso}-${crypto.randomBytes(4).toString('hex')}`;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function encryptBuffer(buffer) {
  const key = encryptionKey();

  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      const err = new Error('Backup encryption is not configured');
      err.status = 503;
      throw err;
    }

    return {
      encrypted: false,
      cipher: 'none',
      buffer
    };
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, {
    authTagLength: 16
  });
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    encrypted: true,
    cipher: 'aes-256-gcm',
    buffer: Buffer.concat([iv, tag, ciphertext])
  };
}

function decryptBuffer(buffer, metadata) {
  if (!metadata.encrypted) return buffer;

  if (metadata.cipher !== 'aes-256-gcm') {
    const err = new Error('Unsupported backup encryption format');
    err.status = 409;
    throw err;
  }

  const key = encryptionKey();
  if (!key) {
    const err = new Error('BACKUP_ENCRYPTION_KEY is required to read this backup');
    err.status = 503;
    throw err;
  }

  if (buffer.length < 29) {
    const err = new Error('Encrypted backup is too small to be valid');
    err.status = 409;
    throw err;
  }

  try {
    const iv = buffer.subarray(0, 12);
    const tag = buffer.subarray(12, 28);
    const ciphertext = buffer.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, {
      authTagLength: 16
    });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    const err = new Error('Backup decryption failed. Check BACKUP_ENCRYPTION_KEY and file integrity.');
    err.status = 409;
    throw err;
  }
}

function publicMetadata(row) {
  if (!row) return null;
  const result = { ...row };
  delete result._id;
  delete result.storageFileId;
  delete result.storageBucket;
  return result;
}

async function userCollections() {
  ensureConnected();
  const rows = await mongoose.connection.db
    .listCollections({}, { nameOnly: true })
    .toArray();

  return rows
    .map(row => row.name)
    .filter(name =>
      name &&
      !name.startsWith('system.') &&
      !INTERNAL_COLLECTIONS.has(name)
    )
    .sort();
}

async function collectionIndexes(collection) {
  try {
    return await collection.indexes();
  } catch {
    return [];
  }
}

async function snapshotPayload(reason = 'manual') {
  const db = mongoose.connection.db;
  const names = await userCollections();
  const data = {};
  const collections = [];
  const session = mongoose.connection.getClient().startSession({ snapshot: true });
  let bytes = 0;
  try {

  for (const name of names) {
    const collection = db.collection(name);
    const docs = [];
    const indexes = await collectionIndexes(collection);
    for await (const doc of collection.find({}, { session })) {
      bytes += Buffer.byteLength(EJSON.stringify(doc, { relaxed: false }));
      if (bytes > maximumBytes()) throw Object.assign(new Error('Logical backup exceeds BACKUP_MAX_BYTES; use a managed database snapshot'), { status: 413 });
      docs.push(doc);
    }

    data[name] = docs;
    collections.push({
      name,
      count: docs.length,
      indexes
    });
  }
  } finally { await session.endSession(); }

  return {
    format: 'academyflow-logical-backup',
    version: 3,
    storage: 'mongodb-gridfs',
    createdAt: new Date(),
    database: db.databaseName,
    reason,
    collections,
    data
  };
}

function maximumBytes() {
  return Math.min(Math.max(Number(process.env.BACKUP_MAX_BYTES) || 32 * 1024 * 1024, 1024 * 1024), 256 * 1024 * 1024);
}

async function uploadBuffer(id, buffer) {
  const stream = bucket().openUploadStream(id + '.backup', {
    contentType: 'application/octet-stream',
    metadata: {
      kind: 'academyflow-backup',
      backupId: id,
      createdAt: new Date()
    }
  });

  await new Promise((resolve, reject) => {
    stream.once('error', reject);
    stream.once('finish', resolve);
    stream.end(buffer);
  });

  return stream.id;
}

async function downloadBuffer(fileId) {
  if (!fileId || !mongoose.isValidObjectId(fileId)) {
    const err = new Error('Backup storage reference is invalid');
    err.status = 409;
    throw err;
  }

  const chunks = [];
  const stream = bucket().openDownloadStream(
    new mongoose.Types.ObjectId(String(fileId))
  );

  return new Promise((resolve, reject) => {
    let bytes = 0;
    stream.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > maximumBytes() * 2) stream.destroy(Object.assign(new Error('Backup exceeds configured size limit'), { status: 413 }));
      else chunks.push(chunk);
    });
    stream.once('error', err => {
      const missing = new Error('Backup data is missing from MongoDB GridFS');
      missing.status = 409;
      missing.cause = err;
      reject(missing);
    });
    stream.once('end', () => resolve(Buffer.concat(chunks)));
  });
}

async function deleteGridFsFile(fileId) {
  if (!fileId || !mongoose.isValidObjectId(fileId)) return;

  try {
    await bucket().delete(new mongoose.Types.ObjectId(String(fileId)));
  } catch (err) {
    if (!/file not found/i.test(String(err?.message || ''))) throw err;
  }
}

async function writeBackup(reason = 'manual') {
  ensureProductionConfig();
  ensureConnected();

  const id = timestampId();
  const payload = await snapshotPayload(reason);
  const raw = Buffer.from(EJSON.stringify(payload, { relaxed: false }), 'utf8');
  if (raw.length > maximumBytes() * 2) throw Object.assign(new Error('Backup exceeds configured size limit'), { status: 413 });
  const compressed = await gzip(raw, { level: 9 });
  const protectedData = encryptBuffer(compressed);
  const digest = sha256(protectedData.buffer);

  const storageFileId = await uploadBuffer(id, protectedData.buffer);

  const metadata = {
    id,
    fileName: id + '.backup',
    formatVersion: payload.version,
    storage: 'mongodb-gridfs',
    createdAt: payload.createdAt.toISOString(),
    database: payload.database,
    reason,
    encrypted: protectedData.encrypted,
    cipher: protectedData.cipher,
    sha256: digest,
    sizeBytes: protectedData.buffer.length,
    collectionCount: payload.collections.length,
    documentCount: payload.collections.reduce((sum, row) => sum + row.count, 0),
    collections: payload.collections.map(row => ({
      name: row.name,
      count: row.count,
      indexCount: row.indexes.length
    })),
    storageFileId,
    storageBucket: BACKUP_BUCKET
  };

  try {
    metadata.external = await externalBackup.mirrorBackup({ id, buffer: protectedData.buffer, metadata: publicMetadata(metadata) });
    await records().insertOne(metadata);
  } catch (err) {
    await deleteGridFsFile(storageFileId).catch(() => {});
    throw err;
  }

  return publicMetadata(metadata);
}

async function readMetadataInternal(id) {
  const clean = safeBackupId(id);
  if (!clean) {
    const err = new Error('Invalid backup id');
    err.status = 400;
    throw err;
  }

  const row = await records().findOne({ id: clean });
  if (!row) {
    const err = new Error('Backup not found');
    err.status = 404;
    throw err;
  }

  return row;
}

async function deleteBackup(id) {
  const row = await readMetadataInternal(id);
  await deleteGridFsFile(row.storageFileId);
  await records().deleteOne({ _id: row._id });
}

async function listBackups() {
  ensureConnected();

  const rows = await records()
    .find({ id: { $type: 'string' } })
    .sort({ createdAt: -1 })
    .toArray();

  return rows
    .filter(row =>
      safeBackupId(row.id) &&
      /^[a-f0-9]{64}$/i.test(String(row.sha256 || ''))
    )
    .map(publicMetadata);
}

async function pruneBackups() {
  const retention = Math.min(
    Math.max(Number(process.env.BACKUP_RETENTION_COUNT || 5), 2),
    30
  );

  const rows = await listBackups();
  for (const row of rows.slice(retention)) {
    await deleteBackup(row.id).catch(err => {
      console.error('[backup] prune failed', row.id, err.message);
    });
  }
}

async function createBackup({ reason = 'manual' } = {}) {
  if (await restoreInProgress()) throw Object.assign(new Error('Restore is in progress'), { status: 409 });
  if (busy) {
    const err = new Error(`Backup system is busy with ${busyOperation}`);
    err.status = 409;
    throw err;
  }

  busy = true;
  busyOperation = 'backup';

  try {
    const metadata = await writeBackup(reason);
    await pruneBackups();
    return metadata;
  } finally {
    busy = false;
    busyOperation = '';
  }
}

async function validateBackup(id) {
  const internal = await readMetadataInternal(id);
  const metadata = publicMetadata(internal);

  if (!/^[a-f0-9]{64}$/i.test(String(metadata.sha256 || ''))) {
    const err = new Error('Backup checksum metadata is invalid');
    err.status = 409;
    throw err;
  }

  const protectedData = await downloadBuffer(internal.storageFileId);
  const actualHash = Buffer.from(sha256(protectedData), 'hex');
  const expectedHash = Buffer.from(metadata.sha256, 'hex');

  if (
    actualHash.length !== expectedHash.length ||
    !crypto.timingSafeEqual(actualHash, expectedHash)
  ) {
    const err = new Error('Backup integrity check failed');
    err.status = 409;
    throw err;
  }

  let payload;
  try {
    const compressed = decryptBuffer(protectedData, metadata);
    payload = EJSON.parse(
      (await gunzip(compressed, { maxOutputLength: maximumBytes() * 2 })).toString('utf8'),
      { relaxed: true }
    );
  } catch (err) {
    if (err?.status) throw err;
    const invalid = new Error('Backup data is corrupted or unreadable');
    invalid.status = 409;
    throw invalid;
  }

  if (
    payload?.format !== 'academyflow-logical-backup' ||
    ![1, 2, 3].includes(payload?.version) ||
    !payload.data ||
    !Array.isArray(payload.collections)
  ) {
    const err = new Error('Unsupported backup format');
    err.status = 409;
    throw err;
  }

  for (const row of payload.collections) {
    if (
      !row?.name ||
      row.name.startsWith('system.') ||
      INTERNAL_COLLECTIONS.has(row.name) ||
      !Array.isArray(payload.data[row.name])
    ) {
      const err = new Error('Backup collection manifest is invalid');
      err.status = 409;
      throw err;
    }
  }

  return { metadata, payload };
}

async function insertInBatches(collection, docs, session) {
  const batchSize = 500;
  for (let i = 0; i < docs.length; i += batchSize) {
    await collection.insertMany(
      docs.slice(i, i + batchSize),
      { ordered: true, session }
    );
  }
}

function indexOptions(spec) {
  const allowed = [
    'name',
    'unique',
    'sparse',
    'expireAfterSeconds',
    'partialFilterExpression',
    'collation',
    'weights',
    'default_language',
    'language_override',
    'textIndexVersion',
    '2dsphereIndexVersion',
    'bits',
    'min',
    'max',
    'bucketSize',
    'storageEngine',
    'hidden'
  ];

  const options = {};
  for (const key of allowed) {
    if (spec[key] !== undefined) options[key] = spec[key];
  }
  return options;
}

async function restoreIndexes(collection, specs) {
  if (!Array.isArray(specs)) return;

  for (const spec of specs) {
    if (!spec?.key || spec.name === '_id_') continue;
    await collection.createIndex(spec.key, indexOptions(spec));
  }
}

async function restoreBackup(id) {
  if (busy) {
    const err = new Error(`Backup system is busy with ${busyOperation}`);
    err.status = 409;
    throw err;
  }

  ensureProductionConfig();
  ensureConnected();

  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ENABLE_PRODUCTION_RESTORE !== 'true'
  ) {
    const err = new Error(
      'Production restore is disabled. Set ENABLE_PRODUCTION_RESTORE=true for an intentional restore window.'
    );
    err.status = 403;
    throw err;
  }

  busy = true;
  busyOperation = 'restore';
  let restoreSession;
  let lock;

  try {
    const hello = await mongoose.connection.db.command({ hello: 1 });
    if (!hello.setName && hello.msg !== 'isdbgrid') throw Object.assign(new Error('Atomic restore requires a MongoDB replica set or sharded cluster'), { status: 503 });
    lock = await acquireRestoreLock();
    const { metadata, payload } = await validateBackup(id);

    // Stored in the MongoDB backup bucket, which is deliberately excluded from
    // the logical snapshot so restoring application data cannot delete the
    // source backup or its safety point.
    const safetyBackup = await writeBackup('pre-restore-safety');

    const db = mongoose.connection.db;
    const manifest = new Map(
      payload.collections.map(row => [row.name, row])
    );
    const payloadNames = Object.keys(payload.data)
      .filter(name =>
        !name.startsWith('system.') &&
        !INTERNAL_COLLECTIONS.has(name)
      );
    const currentNames = await userCollections();
    const namesToClear = [...new Set([...currentNames, ...payloadNames])];
    await db.collection('academyflow_auth_state').updateOne({ _id: 'sessions' }, { $setOnInsert: { epoch: '' } }, { upsert: true });

    // Index/collection preparation is non-destructive; any failure occurs before deletion.
    for (const name of payloadNames) {
      if (!currentNames.includes(name)) await db.createCollection(name);
      await restoreIndexes(db.collection(name), manifest.get(name)?.indexes || []);
    }
    restoreSession = await mongoose.startSession();
    await restoreSession.withTransaction(async () => {
    await db.collection('academyflow_operation_locks').updateOne({ _id: 'restore', owner: lock }, { $set: { touchedAt: new Date() } }, { session: restoreSession });
    for (const name of namesToClear) {
      await db.collection(name).deleteMany({}, { session: restoreSession });
    }

    for (const name of payloadNames) {
      const collection = db.collection(name);
      const docs = Array.isArray(payload.data[name])
        ? payload.data[name]
        : [];

      if (docs.length) {
        await insertInBatches(collection, docs, restoreSession);
      }

    }
    // Restoring old users/revocation records must never resurrect an old JWT.
    await db.collection('academyflow_auth_state').updateOne({ _id: 'sessions' }, { $set: { epoch: crypto.randomUUID() } }, { session: restoreSession });
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });

    await pruneBackups();

    return {
      restored: metadata,
      safetyBackup,
      restoredCollections: payloadNames.length,
      restoredDocuments: payload.collections.reduce(
        (sum, row) => sum + Number(row.count || 0),
        0
      )
    };
  } finally {
    if (restoreSession) await restoreSession.endSession();
    if (lock) await mongoose.connection.db.collection('academyflow_operation_locks').deleteOne({ _id: 'restore', owner: lock });
    busy = false;
    busyOperation = '';
  }
}

async function acquireRestoreLock() {
  const owner = crypto.randomUUID();
  try {
    await mongoose.connection.db.collection('academyflow_operation_locks').insertOne({ _id: 'restore', owner, createdAt: new Date() });
  } catch (err) {
    if (err.code === 11000) throw Object.assign(new Error('A restore lock already exists. Verify the operation has stopped before clearing a stale lock.'), { status: 409 });
    throw err;
  }
  return owner;
}
async function restoreInProgress() {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return false;
  return Boolean(await mongoose.connection.db.collection('academyflow_operation_locks').findOne({ _id: 'restore' }));
}

async function storageStatus() {
  const result = {
    provider: 'mongodb-gridfs',
    bucket: BACKUP_BUCKET,
    directory: null,
    explicitlyConfigured: explicitStorageConfigured(),
    encryptionConfigured: encryptionConfigured(),
    productionReady: productionReady(),
    writable: false,
    freeBytes: null,
    totalBytes: null,
    usedBytes: null,
    error: '',
    external: externalBackup.configStatus()
  };

  try {
    ensureConnected();
    await mongoose.connection.db.command({ ping: 1 });

    const probeId = 'probe-' + crypto.randomBytes(8).toString('hex');
    await records().insertOne({
      id: probeId,
      probe: true,
      createdAt: new Date().toISOString()
    });
    await records().deleteOne({ id: probeId, probe: true });
    result.writable = true;

    try {
      const stats = await mongoose.connection.db.command({
        dbStats: 1,
        scale: 1
      });
      result.usedBytes = Number(stats.storageSize || stats.dataSize || 0) || null;
    } catch {}
  } catch (err) {
    result.error = String(err.message || err).slice(0, 500);
  }

  return result;
}

function isBusy() {
  return busy;
}

function operation() {
  return busyOperation;
}

module.exports = {
  importExternalBackup: async id => {
    const clean = safeBackupId(id);
    if (!clean) throw new Error('Invalid backup ID');
    const { metadata, buffer } = await externalBackup.fetchBackup(clean, maximumBytes() * 2);
    if (!metadata.encrypted || sha256(buffer) !== metadata.sha256) throw new Error('External backup integrity check failed');
    if (await records().findOne({ id: clean })) throw new Error('Backup already exists');
    const storageFileId = await uploadBuffer(clean, buffer);
    const row = { ...metadata, storageFileId, storageBucket: BACKUP_BUCKET };
    await records().insertOne(row);
    try { await validateBackup(clean); }
    catch (err) { await deleteBackup(clean); throw err; }
    return publicMetadata(row);
  },
  restoreInProgress,
  BACKUP_BUCKET,
  createBackup,
  restoreBackup,
  validateBackup,
  listBackups,
  storageStatus,
  explicitStorageConfigured,
  encryptionConfigured,
  productionReady,
  isBusy,
  operation
};
