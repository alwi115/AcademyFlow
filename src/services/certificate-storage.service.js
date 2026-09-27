const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const ROOT = path.resolve(
  process.env.CERTIFICATE_STORAGE_DIR ||
  path.join(process.cwd(), '.data', 'certificates')
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

async function savePdf({ academyId, certificateId, buffer }) {
  assertPdf(buffer);

  const academy = safeSegment(academyId);
  const certificate = safeSegment(certificateId);
  const dir = path.join(ROOT, academy);
  await fsp.mkdir(dir, { recursive: true });

  const filename =
    certificate + '-' + Date.now() + '-' + crypto.randomBytes(8).toString('hex') + '.pdf';
  const finalPath = path.join(dir, filename);
  const tempPath = finalPath + '.tmp-' + crypto.randomBytes(5).toString('hex');

  await fsp.writeFile(tempPath, buffer, { mode: 0o600 });
  await fsp.rename(tempPath, finalPath);

  return academy + '/' + filename;
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
