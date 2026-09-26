const router = require('express').Router();
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { auth } = require('../middleware/auth');
const { login, me, logout } = require('../controllers/auth.controller');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    message: 'محاولات دخول كثيرة. حاول مرة أخرى بعد عدة دقائق.'
  }
});

function allowedRequestOrigin(req) {
  const origin = String(req.get('origin') || '').trim();
  if (!origin) return true;

  const configured = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  const requestOrigin = `${req.protocol}://${req.get('host')}`;
  return origin === requestOrigin || configured.includes(origin);
}

function requireTrustedOrigin(req, res, next) {
  if (!allowedRequestOrigin(req)) {
    return res.status(403).json({ message: 'Cross-site request blocked' });
  }
  next();
}

const CSRF_COOKIE_NAME = 'af_csrf';

function secureCookie() {
  return process.env.NODE_ENV === 'production' ||
    Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_ID);
}

function parseCookies(req) {
  return String(req.get('cookie') || '')
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf('=');
      if (separator === -1) return cookies;
      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }
      return cookies;
    }, {});
}

function csrfCookieOptions() {
  return {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: 30 * 60 * 1000
  };
}

function safeTokenEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireCsrf(req, res, next) {
  const cookieToken = parseCookies(req)[CSRF_COOKIE_NAME];
  const submittedToken = String(req.body?._csrf || req.get('x-csrf-token') || '');

  if (!safeTokenEqual(cookieToken, submittedToken)) {
    return res.status(403).json({ message: 'Invalid CSRF token' });
  }

  next();
}

router.get('/csrf', (req, res) => {
  const csrfToken = crypto.randomBytes(32).toString('base64url');

  res.cookie(CSRF_COOKIE_NAME, csrfToken, csrfCookieOptions());
  res.set({
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache'
  });
  res.json({ csrfToken });
});

router.post('/login', requireTrustedOrigin, loginLimiter, requireCsrf, login);
router.get('/me', auth, me);
router.post('/logout', requireTrustedOrigin, logout);

module.exports = router;
