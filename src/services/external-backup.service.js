const { S3Client, PutObjectCommand, GetObjectCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');
function configured() {
  return Boolean(process.env.EXTERNAL_BACKUP_BUCKET && process.env.EXTERNAL_BACKUP_ACCESS_KEY_ID && process.env.EXTERNAL_BACKUP_SECRET_ACCESS_KEY);
}
function configStatus() {
  return { configured: configured(), bucketConfigured: Boolean(process.env.EXTERNAL_BACKUP_BUCKET), region: process.env.EXTERNAL_BACKUP_REGION || 'auto', prefix: process.env.EXTERNAL_BACKUP_PREFIX || 'academyflow' };
}
function client() {
  if (!configured()) throw Object.assign(new Error('External backup storage is not configured'), { status: 503 });
  if (process.env.EXTERNAL_BACKUP_ENDPOINT && !process.env.EXTERNAL_BACKUP_ENDPOINT.startsWith('https://') && process.env.NODE_ENV === 'production') {
    throw new Error('External backup endpoint must use HTTPS in production');
  }
  return new S3Client({
    region: process.env.EXTERNAL_BACKUP_REGION || 'auto',
    endpoint: process.env.EXTERNAL_BACKUP_ENDPOINT || undefined,
    forcePathStyle: process.env.EXTERNAL_BACKUP_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId: process.env.EXTERNAL_BACKUP_ACCESS_KEY_ID, secretAccessKey: process.env.EXTERNAL_BACKUP_SECRET_ACCESS_KEY }
  });
}
function objectKey(name) {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error('Invalid backup object name');
  const prefix = String(process.env.EXTERNAL_BACKUP_PREFIX || 'academyflow').split('/').filter(Boolean).join('/');
  return prefix ? prefix + '/' + name : name;
}
async function mirrorBackup({ id, buffer, metadata }) {
  if (!configured()) {
    if (process.env.REQUIRE_EXTERNAL_BACKUP === 'true') throw Object.assign(new Error('Independent backup storage is required'), { status: 503 });
    return { configured: false, uploaded: false, provider: 's3-compatible' };
  }
  if (!metadata.encrypted) throw new Error('External backups must be encrypted');
  const s3 = client();
  const dataKey = objectKey(id + '.backup'), metadataKey = objectKey(id + '.json');
  for (const [key, body, contentType] of [[dataKey, buffer, 'application/octet-stream'], [metadataKey, JSON.stringify(metadata), 'application/json']]) {
    await s3.send(new PutObjectCommand({ Bucket: process.env.EXTERNAL_BACKUP_BUCKET, Key: key, Body: body, ContentType: contentType,
      ServerSideEncryption: process.env.EXTERNAL_BACKUP_SSE === 'AES256' ? 'AES256' : undefined }));
  }
  return { configured: true, uploaded: true, provider: 's3-compatible', dataKey, metadataKey, uploadedAt: new Date().toISOString() };
}
async function readObject(name, maxBytes) {
  const response = await client().send(new GetObjectCommand({ Bucket: process.env.EXTERNAL_BACKUP_BUCKET, Key: objectKey(name) }));
  if (response.ContentLength > maxBytes) throw new Error('External backup exceeds configured limit');
  const chunks = []; let bytes = 0;
  for await (const chunk of response.Body) {
    bytes += chunk.length;
    if (bytes > maxBytes) { response.Body.destroy(); throw new Error('External backup exceeds configured limit'); }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function fetchBackup(id, maxBytes) {
  const metadata = JSON.parse((await readObject(id + '.json', 1024 * 1024)).toString('utf8'));
  if (metadata.id !== id) throw new Error('External backup metadata ID mismatch');
  return { metadata, buffer: await readObject(id + '.backup', maxBytes) };
}
async function healthCheck() {
  if (!configured()) return { configured: false, ok: false, reason: 'not_configured' };
  try { await client().send(new HeadBucketCommand({ Bucket: process.env.EXTERNAL_BACKUP_BUCKET })); return { configured: true, ok: true }; }
  catch (err) { return { configured: true, ok: false, reason: err.name }; }
}
module.exports = { configured, configStatus, mirrorBackup, fetchBackup, healthCheck };
