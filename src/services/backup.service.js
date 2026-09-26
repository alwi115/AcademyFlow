const fs = require('fs/promises');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { promisify } = require('util');
const mongoose = require('mongoose');
const { EJSON } = require('bson');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

let busy = false;
let busyOperation = '';

function backupDir() {
  return path.resolve(
    process.env.BACKUP_DIR ||
    path.join(process.cwd(), 'backups')
  );
}

function explicitStorageConfigured() {
  return Boolean(String(process.env.BACKUP_DIR || '').trim());
}

function encryptionConfigured() {
  return String(process.env.BACKUP_ENCRYPTION_KEY || '').length >= 32;
}

function productionReady() {
  if (process.env.NODE_ENV !== 'production') return true;
  return explicitStorageConfigured() && encryptionConfigured();
}

function encryptionKey() {
  const secret = String(process.env.BACKUP_ENCRYPTION_KEY || '');
  if (secret.length < 32) return null;
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

function ensureProductionConfig() {
  if (process.env.NODE_ENV !== 'production') return;

  if (!explicitStorageConfigured()) {
    const err = new Error('BACKUP_DIR must point to persistent storage in production');
    err.status = 503;
    throw err;
  }

  if (!encryptionConfigured()) {
    const err = new Error('BACKUP_ENCRYPTION_KEY must be at least 32 characters in production');
    err.status = 503;
    throw err;
  }
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
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
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
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    const err = new Error('Backup decryption failed. Check BACKUP_ENCRYPTION_KEY and file integrity.');
    err.status = 409;
    throw err;
  }
}

async function ensureDir() {
  const dir = backupDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function userCollections() {
  const rows = await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray();
  return rows
    .map(row => row.name)
    .filter(name => name && !name.startsWith('system.'))
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

  for (const name of names) {
    const collection = db.collection(name);
    const [docs, indexes] = await Promise.all([
      collection.find({}).toArray(),
      collectionIndexes(collection)
    ]);

    data[name] = docs;
    collections.push({
      name,
      count: docs.length,
      indexes
    });
  }

  return {
    format: 'academyflow-logical-backup',
    version: 2,
    createdAt: new Date(),
    database: db.databaseName,
    reason,
    collections,
    data
  };
}

async function writeBackup(reason = 'manual') {
  ensureProductionConfig();

  if (mongoose.connection.readyState !== 1) {
    const err = new Error('Database is not connected');
    err.status = 503;
    throw err;
  }

  const dir = await ensureDir();
  const id = timestampId();
  const payload = await snapshotPayload(reason);
  const raw = Buffer.from(EJSON.stringify(payload, { relaxed: false }), 'utf8');
  const compressed = await gzip(raw, { level: 9 });
  const protectedData = encryptBuffer(compressed);
  const digest = sha256(protectedData.buffer);

  const fileName = id + '.backup';
  const metaName = id + '.meta.json';
  const filePath = path.join(dir, fileName);
  const metaPath = path.join(dir, metaName);

  await fs.writeFile(filePath, protectedData.buffer, { flag: 'wx', mode: 0o600 });

  const metadata = {
    id,
    fileName,
    formatVersion: payload.version,
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
    }))
  };

  await fs.writeFile(
    metaPath,
    JSON.stringify(metadata, null, 2),
    { flag: 'wx', mode: 0o600 }
  );

  return metadata;
}

async function pruneBackups() {
  const retention = Math.min(
    Math.max(Number(process.env.BACKUP_RETENTION_COUNT || 14), 2),
    100
  );

  const rows = await listBackups();
  for (const row of rows.slice(retention)) {
    const dir = backupDir();
    await Promise.allSettled([
      fs.unlink(path.join(dir, row.id + '.backup')),
      fs.unlink(path.join(dir, row.id + '.json.gz')),
      fs.unlink(path.join(dir, row.id + '.meta.json'))
    ]);
  }
}

async function createBackup({ reason = 'manual' } = {}) {
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

async function readMetadata(id) {
  const clean = safeBackupId(id);
  if (!clean) {
    const err = new Error('Invalid backup id');
    err.status = 400;
    throw err;
  }

  const metaPath = path.join(backupDir(), clean + '.meta.json');

  try {
    const metadata = JSON.parse(await fs.readFile(metaPath, 'utf8'));

    if (metadata.id !== clean) {
      const err = new Error('Backup metadata id mismatch');
      err.status = 409;
      throw err;
    }

    return metadata;
  } catch (err) {
    if (err.code === 'ENOENT') {
      const notFound = new Error('Backup not found');
      notFound.status = 404;
      throw notFound;
    }
    throw err;
  }
}

async function listBackups() {
  const dir = await ensureDir();
  const names = await fs.readdir(dir);
  const metaNames = names.filter(name => /^academyflow-.*\.meta\.json$/.test(name));
  const rows = [];

  for (const name of metaNames) {
    try {
      const row = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'));
      if (
        row?.id &&
        safeBackupId(row.id) &&
        /^[a-f0-9]{64}$/i.test(String(row.sha256 || ''))
      ) {
        rows.push(row);
      }
    } catch {}
  }

  return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function backupDataPath(metadata) {
  const extension = metadata.formatVersion >= 2 ? '.backup' : '.json.gz';
  return path.join(backupDir(), metadata.id + extension);
}

async function validateBackup(id) {
  const metadata = await readMetadata(id);

  if (!/^[a-f0-9]{64}$/i.test(String(metadata.sha256 || ''))) {
    const err = new Error('Backup checksum metadata is invalid');
    err.status = 409;
    throw err;
  }

  let protectedData;
  try {
    protectedData = await fs.readFile(backupDataPath(metadata));
  } catch (err) {
    if (err.code === 'ENOENT') {
      const missing = new Error('Backup data file is missing');
      missing.status = 409;
      throw missing;
    }
    throw err;
  }

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
    payload = EJSON.parse((await gunzip(compressed)).toString('utf8'), { relaxed: true });
  } catch (err) {
    if (err?.status) throw err;
    const invalid = new Error('Backup file is corrupted or unreadable');
    invalid.status = 409;
    throw invalid;
  }

  if (
    payload?.format !== 'academyflow-logical-backup' ||
    ![1, 2].includes(payload?.version) ||
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
      !Array.isArray(payload.data[row.name])
    ) {
      const err = new Error('Backup collection manifest is invalid');
      err.status = 409;
      throw err;
    }
  }

  return { metadata, payload };
}

async function insertInBatches(collection, docs) {
  const batchSize = 500;
  for (let i = 0; i < docs.length; i += batchSize) {
    await collection.insertMany(docs.slice(i, i + batchSize), { ordered: true });
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

  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ENABLE_PRODUCTION_RESTORE !== 'true'
  ) {
    const err = new Error('Production restore is disabled. Set ENABLE_PRODUCTION_RESTORE=true for an intentional restore window.');
    err.status = 403;
    throw err;
  }

  busy = true;
  busyOperation = 'restore';

  try {
    const { metadata, payload } = await validateBackup(id);

    // Always create a rollback point from the current state before destructive writes.
    const safetyBackup = await writeBackup('pre-restore-safety');
    const db = mongoose.connection.db;
    const manifest = new Map(payload.collections.map(row => [row.name, row]));
    const payloadNames = Object.keys(payload.data).filter(name => !name.startsWith('system.'));
    const currentNames = await userCollections();
    const namesToClear = [...new Set([...currentNames, ...payloadNames])];

    for (const name of namesToClear) {
      await db.collection(name).deleteMany({});
    }

    for (const name of payloadNames) {
      const collection = db.collection(name);
      const docs = Array.isArray(payload.data[name]) ? payload.data[name] : [];

      if (docs.length) {
        await insertInBatches(collection, docs);
      }

      await restoreIndexes(collection, manifest.get(name)?.indexes || []);
    }

    await pruneBackups();

    return {
      restored: metadata,
      safetyBackup,
      restoredCollections: payloadNames.length,
      restoredDocuments: payload.collections.reduce((sum, row) => sum + Number(row.count || 0), 0)
    };
  } finally {
    busy = false;
    busyOperation = '';
  }
}

async function storageStatus() {
  const dir = backupDir();
  let writable = false;
  let freeBytes = null;
  let totalBytes = null;
  let error = '';

  try {
    await ensureDir();
    const probe = path.join(dir, '.write-test-' + process.pid + '-' + Date.now());
    await fs.writeFile(probe, 'ok', { flag: 'wx', mode: 0o600 });
    await fs.unlink(probe);
    writable = true;

    if (typeof fs.statfs === 'function') {
      const stat = await fs.statfs(dir);
      freeBytes = Number(stat.bavail) * Number(stat.bsize);
      totalBytes = Number(stat.blocks) * Number(stat.bsize);
    }
  } catch (err) {
    error = String(err.message || err).slice(0, 500);
  }

  return {
    directory: dir,
    explicitlyConfigured: explicitStorageConfigured(),
    encryptionConfigured: encryptionConfigured(),
    productionReady: productionReady(),
    writable,
    freeBytes,
    totalBytes,
    error
  };
}

function isBusy() {
  return busy;
}

function operation() {
  return busyOperation;
}

module.exports = {
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
