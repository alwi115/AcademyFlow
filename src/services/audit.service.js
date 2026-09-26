const AuditLog = require('../models/AuditLog');

const SENSITIVE_KEY = /(password|passcode|secret|token|authorization|cookie|api[_-]?key|private|credential)/i;

function sanitize(value, depth = 0) {
  if (depth > 5) return '[max-depth]';
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.slice(0, 100).map(item => sanitize(item, depth + 1));
  }

  if (value instanceof Date) return value;
  if (typeof value !== 'object') {
    if (typeof value === 'string') return value.slice(0, 2000);
    return value;
  }

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) {
      output[key] = '[redacted]';
      continue;
    }
    output[key] = sanitize(item, depth + 1);
  }
  return output;
}

function clientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || '')
    .replace(/^::ffff:/, '')
    .slice(0, 100);
}

async function record(req, {
  action,
  targetType = 'api',
  targetId = '',
  targetLabel = '',
  details = {},
  before = null,
  after = null,
  statusCode = null,
  source = 'controller'
}) {
  try {
    const row = await AuditLog.create({
      actorId: req.user?.sub || null,
      actorRole: req.user?.role || '',
      academyId: req.user?.academyId || req.academyId || null,
      action: String(action || '').slice(0, 180),
      targetType: String(targetType || 'api').slice(0, 100),
      targetId: targetId ? String(targetId).slice(0, 300) : '',
      targetLabel: String(targetLabel || '').slice(0, 500),
      method: String(req.method || '').slice(0, 16),
      path: String(req.originalUrl || req.path || '').split('?')[0].slice(0, 1000),
      statusCode: statusCode == null ? null : Number(statusCode),
      ip: clientIp(req),
      userAgent: String(req.get?.('user-agent') || '').slice(0, 500),
      requestId: String(req.requestId || '').slice(0, 100),
      source,
      before: before == null ? null : sanitize(before),
      after: after == null ? null : sanitize(after),
      details: sanitize(details)
    });

    req._auditRecorded = true;
    return row;
  } catch (err) {
    console.error('[audit]', err.message);
    return null;
  }
}

module.exports = { record, sanitize };
