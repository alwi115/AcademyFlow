const mongoose = require('mongoose');

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const BUCKET_NAME = 'academyflow_certificates';
const KEY_PREFIX = 'gridfs:';

function assertConnected() {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    const err = new Error('MongoDB storage is not connected');
    err.status = 503;
    throw err;
  }
}

function bucket() {
  assertConnected();
  return new mongoose.mongo.GridFSBucket(
    mongoose.connection.db,
    { bucketName: BUCKET_NAME }
  );
}

function assertPdf(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    const err = new Error('اختر ملف PDF للشهادة');
    err.status = 400;
    throw err;
  }

  if (buffer.length > MAX_PDF_BYTES) {
    const err = new Error('حجم ملف الشهادة يجب ألا يتجاوز 10MB');
    err.status = 413;
    throw err;
  }

  const header = buffer.subarray(0, 5).toString('ascii');
  if (header !== '%PDF-') {
    const err = new Error('الملف المرفوع ليس ملف PDF صالحًا');
    err.status = 415;
    throw err;
  }
}

function storageId(storageKey) {
  const value = String(storageKey || '').trim();
  if (!value.startsWith(KEY_PREFIX)) {
    const err = new Error('Certificate file is not stored in MongoDB GridFS');
    err.status = 409;
    err.code = 'LEGACY_STORAGE_KEY';
    throw err;
  }

  const id = value.slice(KEY_PREFIX.length);
  if (!mongoose.isValidObjectId(id)) {
    const err = new Error('Invalid certificate storage key');
    err.status = 409;
    throw err;
  }

  return new mongoose.Types.ObjectId(id);
}

function notFound() {
  const err = new Error('Certificate file not found in MongoDB');
  err.status = 404;
  err.code = 'ENOENT';
  return err;
}

async function savePdf({ academyId, certificateId, buffer }) {
  assertPdf(buffer);
  assertConnected();

  const filename =
    String(certificateId) + '-' + Date.now() + '.pdf';

  const upload = bucket().openUploadStream(filename, {
    contentType: 'application/pdf',
    metadata: {
      kind: 'academyflow-certificate',
      academyId: String(academyId),
      certificateId: String(certificateId),
      uploadedAt: new Date()
    }
  });

  await new Promise((resolve, reject) => {
    upload.once('error', reject);
    upload.once('finish', resolve);
    upload.end(buffer);
  });

  return KEY_PREFIX + String(upload.id);
}

async function remove(storageKey) {
  if (!storageKey) return;

  let id;
  try {
    id = storageId(storageKey);
  } catch (err) {
    if (err.code === 'LEGACY_STORAGE_KEY') return;
    throw err;
  }

  try {
    await bucket().delete(id);
  } catch (err) {
    if (
      err?.code === 'ENOENT' ||
      /file not found/i.test(String(err?.message || ''))
    ) {
      return;
    }
    throw err;
  }
}

async function stat(storageKey) {
  const id = storageId(storageKey);
  const file = await bucket().find({ _id: id }).next();
  if (!file) throw notFound();

  return {
    size: Number(file.length || 0),
    createdAt: file.uploadDate || null,
    contentType:
      file.contentType ||
      file.metadata?.contentType ||
      'application/pdf',
    metadata: file.metadata || {}
  };
}

async function read(storageKey) {
  const id = storageId(storageKey);
  const chunks = [];

  return new Promise((resolve, reject) => {
    const stream = bucket().openDownloadStream(id);

    stream.on('data', chunk => chunks.push(chunk));
    stream.once('error', err => {
      if (
        err?.code === 'ENOENT' ||
        /file not found/i.test(String(err?.message || ''))
      ) {
        return reject(notFound());
      }
      reject(err);
    });
    stream.once('end', () => resolve(Buffer.concat(chunks)));
  });
}

async function storageStatus() {
  try {
    assertConnected();
    await mongoose.connection.db.command({ ping: 1 });
    return {
      provider: 'mongodb-gridfs',
      bucket: BUCKET_NAME,
      ready: true
    };
  } catch (err) {
    return {
      provider: 'mongodb-gridfs',
      bucket: BUCKET_NAME,
      ready: false,
      error: String(err.message || err).slice(0, 500)
    };
  }
}

module.exports = {
  MAX_PDF_BYTES,
  BUCKET_NAME,
  assertPdf,
  savePdf,
  remove,
  stat,
  read,
  storageStatus
};
