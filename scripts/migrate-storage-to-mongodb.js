const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

const Certificate = require('../src/models/Certificate');
const certificateStorage = require('../src/services/certificate-storage.service');

const BACKUP_BUCKET = 'academyflow_backups';
const BACKUP_RECORDS = 'academyflow_backup_records';

function safePath(root, relative) {
  const clean = String(relative || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');

  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, clean);

  if (
    resolved !== resolvedRoot &&
    !resolved.startsWith(resolvedRoot + path.sep)
  ) {
    throw new Error('Legacy storage path escaped its configured root');
  }

  return resolved;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function safeBackupId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9._-]+$/.test(id) ? id : '';
}

function gridFsBucket() {
  return new mongoose.mongo.GridFSBucket(
    mongoose.connection.db,
    { bucketName: BACKUP_BUCKET }
  );
}

async function existsDirectory(dir) {
  try {
    const stat = await fs.stat(dir);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function migrateCertificates(root, deleteLegacy) {
  const summary = {
    scanned: 0,
    migrated: 0,
    alreadyMongo: 0,
    missing: 0,
    failed: 0
  };

  const rows = await Certificate.find({
    fileStorageKey: { $exists: true, $ne: '' }
  }).select('+fileStorageKey academyId certificateNo fileName fileSize');

  for (const row of rows) {
    summary.scanned += 1;
    const oldKey = String(row.fileStorageKey || '');

    if (oldKey.startsWith('gridfs:')) {
      summary.alreadyMongo += 1;
      continue;
    }

    let legacyPath;
    try {
      legacyPath = safePath(root, oldKey);
      const buffer = await fs.readFile(legacyPath);
      certificateStorage.assertPdf(buffer);

      const newKey = await certificateStorage.savePdf({
        academyId: String(row.academyId),
        certificateId: String(row._id),
        buffer
      });

      const update = await Certificate.updateOne(
        { _id: row._id, fileStorageKey: oldKey },
        {
          $set: {
            fileStorageKey: newKey,
            fileSize: buffer.length,
            fileMimeType: 'application/pdf',
            fileUploadedAt: row.fileUploadedAt || new Date()
          }
        }
      );

      if (!update.modifiedCount) {
        await certificateStorage.remove(newKey).catch(() => {});
        throw new Error('Certificate changed while it was being migrated');
      }

      if (deleteLegacy) {
        await fs.unlink(legacyPath).catch(() => {});
      }

      summary.migrated += 1;
      console.log('[migrate] certificate', String(row._id), '-> MongoDB GridFS');
    } catch (err) {
      if (err?.code === 'ENOENT') {
        summary.missing += 1;
        console.warn('[migrate] certificate file missing', String(row._id), oldKey);
      } else {
        summary.failed += 1;
        console.error('[migrate] certificate failed', String(row._id), err.message);
      }
    }
  }

  return summary;
}

async function uploadBackup(id, buffer) {
  const stream = gridFsBucket().openUploadStream(id + '.backup', {
    contentType: 'application/octet-stream',
    metadata: {
      kind: 'academyflow-backup',
      backupId: id,
      migratedFrom: 'legacy-filesystem',
      migratedAt: new Date()
    }
  });

  await new Promise((resolve, reject) => {
    stream.once('error', reject);
    stream.once('finish', resolve);
    stream.end(buffer);
  });

  return stream.id;
}

async function migrateBackups(root, deleteLegacy) {
  const summary = {
    scanned: 0,
    migrated: 0,
    alreadyMongo: 0,
    invalid: 0,
    missing: 0,
    failed: 0
  };

  if (!(await existsDirectory(root))) {
    return summary;
  }

  const names = await fs.readdir(root);
  const metaNames = names
    .filter(name => /^academyflow-.*\.meta\.json$/.test(name))
    .sort();

  const records = mongoose.connection.db.collection(BACKUP_RECORDS);

  for (const metaName of metaNames) {
    summary.scanned += 1;
    const metaPath = path.join(root, metaName);

    try {
      const metadata = JSON.parse(await fs.readFile(metaPath, 'utf8'));
      const id = safeBackupId(metadata.id);

      if (
        !id ||
        !/^[a-f0-9]{64}$/i.test(String(metadata.sha256 || ''))
      ) {
        summary.invalid += 1;
        continue;
      }

      if (await records.findOne({ id })) {
        summary.alreadyMongo += 1;
        continue;
      }

      const dataName = metadata.formatVersion >= 2
        ? id + '.backup'
        : id + '.json.gz';
      const dataPath = path.join(root, dataName);

      let buffer;
      try {
        buffer = await fs.readFile(dataPath);
      } catch (err) {
        if (err.code === 'ENOENT') {
          summary.missing += 1;
          continue;
        }
        throw err;
      }

      if (sha256(buffer) !== String(metadata.sha256).toLowerCase()) {
        summary.invalid += 1;
        console.warn('[migrate] backup checksum mismatch', id);
        continue;
      }

      const storageFileId = await uploadBackup(id, buffer);
      const record = {
        ...metadata,
        storage: 'mongodb-gridfs',
        storageFileId,
        storageBucket: BACKUP_BUCKET,
        migratedFrom: 'legacy-filesystem',
        migratedAt: new Date().toISOString()
      };

      delete record.external;
      delete record._dataPath;
      delete record._metaPath;

      try {
        await records.insertOne(record);
      } catch (err) {
        await gridFsBucket().delete(storageFileId).catch(() => {});
        throw err;
      }

      if (deleteLegacy) {
        await Promise.allSettled([
          fs.unlink(dataPath),
          fs.unlink(metaPath)
        ]);
      }

      summary.migrated += 1;
      console.log('[migrate] backup', id, '-> MongoDB GridFS');
    } catch (err) {
      summary.failed += 1;
      console.error('[migrate] backup failed', metaName, err.message);
    }
  }

  return summary;
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const certificateRoot = path.resolve(
    process.env.LEGACY_CERTIFICATE_STORAGE_DIR ||
    process.env.CERTIFICATE_STORAGE_DIR ||
    '/data/certificates'
  );

  const backupRoot = path.resolve(
    process.env.LEGACY_BACKUP_DIR ||
    process.env.BACKUP_DIR ||
    '/data/backups'
  );

  const deleteLegacy =
    String(process.env.DELETE_LEGACY_FILES_AFTER_MIGRATION || '').toLowerCase() === 'true';

  console.log('[migrate] certificate root:', certificateRoot);
  console.log('[migrate] backup root:', backupRoot);
  console.log('[migrate] delete legacy files:', deleteLegacy);

  const certificates = await migrateCertificates(certificateRoot, deleteLegacy);
  const backups = await migrateBackups(backupRoot, deleteLegacy);

  console.log(JSON.stringify({
    ok: certificates.failed === 0 && backups.failed === 0,
    certificates,
    backups
  }, null, 2));
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
