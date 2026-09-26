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

async function snapshotPayload(reason = 'manual') {
  const db = mongoose.connection.db;
  const names = await userCollections();
  const data = {};
  const collections = [];

  for (const name of names) {
    const docs = await db.collection(name).find({}).toArray();
    data[name] = docs;
    collections.push({ name, count: docs.length });
  }

  return {
    format: 'academyflow-logical-backup',
    version: 1,
    createdAt: new Date(),
    database: db.databaseName,
    reason,
    collections,
    data
  };
}

async function writeBackup(reason = 'manual') {
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
  const digest = sha256(compressed);

  const fileName = id + '.json.gz';
  const metaName = id + '.meta.json';
  const filePath = path.join(dir, fileName);
  const metaPath = path.join(dir, metaName);

  await fs.writeFile(filePath, compressed, { flag: 'wx', mode: 0o600 });

  const metadata = {
    id,
    fileName,
    createdAt: payload.createdAt.toISOString(),
    database: payload.database,
    reason,
    sha256: digest,
    sizeBytes: compressed.length,
    collectionCount: payload.collections.length,
    documentCount: payload.collections.reduce((sum, row) => sum + row.count, 0),
    collections: payload.collections
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
    return JSON.parse(await fs.readFile(metaPath, 'utf8'));
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
      if (row?.id && row?.sha256) rows.push(row);
    } catch {}
  }

  return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function validateBackup(id) {
  const metadata = await readMetadata(id);
  const filePath = path.join(backupDir(), metadata.id + '.json.gz');

  let compressed;
  try {
    compressed = await fs.readFile(filePath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      const missing = new Error('Backup data file is missing');
      missing.status = 409;
      throw missing;
    }
    throw err;
  }

  const actualHash = sha256(compressed);
  if (!crypto.timingSafeEqual(Buffer.from(actualHash), Buffer.from(metadata.sha256))) {
    const err = new Error('Backup integrity check failed');
    err.status = 409;
    throw err;
  }

  let payload;
  try {
    payload = EJSON.parse((await gunzip(compressed)).toString('utf8'), { relaxed: false });
  } catch {
    const err = new Error('Backup file is corrupted or unreadable');
    err.status = 409;
    throw err;
  }

  if (
    payload?.format !== 'academyflow-logical-backup' ||
    payload?.version !== 1 ||
    !payload.data ||
    !Array.isArray(payload.collections)
  ) {
    const err = new Error('Unsupported backup format');
    err.status = 409;
    throw err;
  }

  return { metadata, payload };
}

async function insertInBatches(collection, docs) {
  const batchSize = 500;
  for (let i = 0; i < docs.length; i += batchSize) {
    await collection.insertMany(docs.slice(i, i + batchSize), { ordered: true });
  }
}

async function restoreBackup(id) {
  if (busy) {
    const err = new Error(`Backup system is busy with ${busyOperation}`);
    err.status = 409;
    throw err;
  }

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
    const payloadNames = Object.keys(payload.data).filter(name => !name.startsWith('system.'));
    const currentNames = await userCollections();
    const namesToClear = [...new Set([...currentNames, ...payloadNames])];

    for (const name of namesToClear) {
      await db.collection(name).deleteMany({});
    }

    for (const name of payloadNames) {
      const docs = Array.isArray(payload.data[name]) ? payload.data[name] : [];
      if (docs.length) {
        await insertInBatches(db.collection(name), docs);
      }
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
  isBusy,
  operation
};
