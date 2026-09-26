const crypto = require('crypto');
const audit = require('../services/audit.service');

const SENSITIVE_PATH = /\/(users|payments|settings|zoom|backups|academies|plans|subscriptions|courses|groups|enrollments|certificates|quizzes|assignments|live)(?:\/|$)/i;
const MUTATING = new Set(['POST','PUT','PATCH','DELETE']);

function auditMiddleware(req, res, next) {
  req.requestId = req.get('x-request-id') || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);

  res.on('finish', () => {
    if (
      !MUTATING.has(req.method) ||
      !req.user ||
      req._auditRecorded ||
      !req.path.startsWith('/api/') ||
      !SENSITIVE_PATH.test(req.path) ||
      res.statusCode < 200 ||
      res.statusCode >= 400
    ) {
      return;
    }

    audit.record(req, {
      action: `api.${req.method.toLowerCase()}`,
      targetType: 'api',
      targetId: req.params?.id || req.params?.studentId || req.params?.seriesId || '',
      targetLabel: req.path,
      details: { automatic: true },
      statusCode: res.statusCode,
      source: 'middleware'
    }).catch(() => {});
  });

  next();
}

module.exports = auditMiddleware;
