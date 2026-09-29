const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const ROOT = path.resolve(
  process.env.CERTIFICATE_STORAGE_DIR ||
  (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_ID
    ? '/data/certificates'
    : path.join(process.cwd(), '.data', 'certificates'))
);

function safeSegment(value) {
  const segment = String(value || '').trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(segment)) {
    const err = new Error('Invalid storage segment');
    err.status = 400;
    throw err;
  }
  return segment;
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

function absolutePath(storageKey) {
  const cleanKey = String(storageKey || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const resolved = path.resolve(ROOT, cleanKey);

  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
    const err = new Error('Invalid certificate storage path');
    err.status = 400;
    throw err;
  }

  return resolved;
}

async function savePdf({ buffer }) {
  if (!Buffer.isBuffer(buffer)) {
    const err = new Error('Invalid PDF upload buffer');
    err.status = 400;
    throw err;
  }

  // Copy the already-parsed raw request body into a server-owned Buffer.
  // File-system paths are generated entirely by the server and never use
  // request values, academy IDs, certificate IDs, or uploaded filenames.
  const pdf = Buffer.from(buffer);
  assertPdf(pdf);

  await fsp.mkdir(ROOT, { recursive: true });

  const filename =
    Date.now() + '-' + crypto.randomBytes(16).toString('hex') + '.pdf';
  const finalPath = path.join(ROOT, filename);
  const tempPath = finalPath + '.tmp-' + crypto.randomBytes(8).toString('hex');

  await fsp.writeFile(tempPath, pdf, { mode: 0o600, flag: 'wx' });
  await fsp.rename(tempPath, finalPath);

  return filename;
}

async function remove(storageKey) {
  if (!storageKey) return;
  try {
    await fsp.unlink(absolutePath(storageKey));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

async function stat(storageKey) {
  return fsp.stat(absolutePath(storageKey));
}

function pathFor(storageKey) {
  return absolutePath(storageKey);
}

module.exports = {
  MAX_PDF_BYTES,
  assertPdf,
  savePdf,
  remove,
  stat,
  pathFor,
  root: ROOT
};
