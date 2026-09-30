const crypto = require('crypto');

const COOKIE_NAME = 'af_csrf';
function cookieValue(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0 || part.slice(0, i).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return ''; }
  }
  return '';
}
function signature(value) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update('csrf:' + value).digest('hex');
}
function safeTokenEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || !left || !right) return false;
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function requireTrustedOrigin(req, res, next) {
  const origin = req.get('origin');
  const allowed = String(process.env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
  if ((origin && origin !== `${req.protocol}://${req.get('host')}` && !allowed.includes(origin)) || req.get('sec-fetch-site') === 'cross-site') {
    return res.status(403).json({ message: 'Cross-site request blocked' });
  }
  next();
}
function issueCsrf(req, res) {
  const random = crypto.randomBytes(32).toString('hex');
  const csrfToken = random + '.' + signature(random);
  res.cookie(COOKIE_NAME, csrfToken, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_ID),
    sameSite: 'strict', path: '/', maxAge: 12 * 60 * 60 * 1000
  });
  res.set('Cache-Control', 'no-store');
  res.json({ csrfToken });
}
function requireCsrf(req, res, next) {
  const cookie = cookieValue(req, COOKIE_NAME);
  const supplied = req.get('x-csrf-token') || req.body?._csrf;
  const [random, mac] = cookie.split('.');
  if (!/^[a-f0-9]{64}$/.test(random || '') || !safeTokenEqual(mac, signature(random)) || !safeTokenEqual(cookie, supplied)) {
    return res.status(403).json({ code: 'CSRF_INVALID', message: 'Invalid CSRF token' });
  }
  next();
}
function protectMutations(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  return requireTrustedOrigin(req, res, () => {
    const bearerOnly = /^Bearer \S+$/.test(req.headers.authorization || '') && !cookieValue(req, 'af_session');
    const path = req.originalUrl || req.path;
    if (bearerOnly && !path.startsWith('/api/auth') && !path.startsWith('/api/public')) return next();
    return requireCsrf(req, res, next);
  });
}
module.exports = { cookieValue, safeTokenEqual, requireCsrf, requireTrustedOrigin, issueCsrf, protectMutations };
