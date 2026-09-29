const assert = require('assert');
const mongoose = require('mongoose');
const storage = require('../src/services/certificate-storage.service');

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  await mongoose.connection.db.dropDatabase();

  const pdf = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n',
    'utf8'
  );

  storage.assertPdf(pdf);

  const key = await storage.savePdf({
    academyId: new mongoose.Types.ObjectId().toString(),
    certificateId: new mongoose.Types.ObjectId().toString(),
    buffer: pdf
  });

  assert(key.startsWith('gridfs:'));

  const info = await storage.stat(key);
  assert.strictEqual(info.size, pdf.length);
  assert.strictEqual(info.contentType, 'application/pdf');

  const loaded = await storage.read(key);
  assert(Buffer.isBuffer(loaded));
  assert.strictEqual(Buffer.compare(loaded, pdf), 0);

  const health = await storage.storageStatus();
  assert.strictEqual(health.provider, 'mongodb-gridfs');
  assert.strictEqual(health.ready, true);

  await storage.remove(key);

  await assert.rejects(
    () => storage.read(key),
    err => err && err.code === 'ENOENT'
  );

  console.log('Certificate MongoDB GridFS storage regression test passed.');
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
