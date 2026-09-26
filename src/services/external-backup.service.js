const fs = require('fs/promises');
const path = require('path');
const { S3Client, PutObjectCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');

function configured() {
  return Boolean(
    process.env.EXTERNAL_BACKUP_BUCKET &&
    process.env.EXTERNAL_BACKUP_ACCESS_KEY_ID &&
    process.env.EXTERNAL_BACKUP_SECRET_ACCESS_KEY
  );
}

function configStatus() {
  return {
    configured: configured(),
    endpointConfigured: Boolean(process.env.EXTERNAL_BACKUP_ENDPOINT),
    bucketConfigured: Boolean(process.env.EXTERNAL_BACKUP_BUCKET),
    region: process.env.EXTERNAL_BACKUP_REGION || 'auto',
    prefix: process.env.EXTERNAL_BACKUP_PREFIX || 'academyflow'
  };
}

function client() {
  if (!configured()) {
    const err = new Error('External backup storage is not configured');
    err.status = 503;
    throw err;
  }

  return new S3Client({
    region: process.env.EXTERNAL_BACKUP_REGION || 'auto',
    endpoint: process.env.EXTERNAL_BACKUP_ENDPOINT || undefined,
    forcePathStyle: process.env.EXTERNAL_BACKUP_FORCE_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: process.env.EXTERNAL_BACKUP_ACCESS_KEY_ID,
      secretAccessKey: process.env.EXTERNAL_BACKUP_SECRET_ACCESS_KEY
    }
  });
}

function objectKey(name) {
  const prefix = String(process.env.EXTERNAL_BACKUP_PREFIX || 'academyflow')
    .replace(/^\/+|\/+$/g, '');
  return prefix ? prefix + '/' + name : name;
}

async function uploadFile(filePath, contentType) {
  const body = await fs.readFile(filePath);
  await client().send(new PutObjectCommand({
    Bucket: process.env.EXTERNAL_BACKUP_BUCKET,
    Key: objectKey(path.basename(filePath)),
    Body: body,
    ContentType: contentType,
    ServerSideEncryption:
      process.env.EXTERNAL_BACKUP_SSE === 'AES256' ? 'AES256' : undefined
  }));
}

async function mirrorBackup({ dataPath, metadataPath }) {
  if (!configured()) {
    return {
      configured: false,
      uploaded: false,
      provider: 's3-compatible'
    };
  }

  await uploadFile(dataPath, 'application/octet-stream');
  await uploadFile(metadataPath, 'application/json');

  return {
    configured: true,
    uploaded: true,
    provider: 's3-compatible',
    bucket: process.env.EXTERNAL_BACKUP_BUCKET,
    dataKey: objectKey(path.basename(dataPath)),
    metadataKey: objectKey(path.basename(metadataPath)),
    uploadedAt: new Date().toISOString()
  };
}

async function healthCheck() {
  if (!configured()) {
    return {
      configured: false,
      ok: false,
      reason: 'not_configured'
    };
  }

  try {
    await client().send(new HeadBucketCommand({
      Bucket: process.env.EXTERNAL_BACKUP_BUCKET
    }));

    return {
      configured: true,
      ok: true,
      bucket: process.env.EXTERNAL_BACKUP_BUCKET
    };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      reason: String(err.message || err).slice(0, 500)
    };
  }
}

module.exports = {
  configured,
  configStatus,
  mirrorBackup,
  healthCheck
};
