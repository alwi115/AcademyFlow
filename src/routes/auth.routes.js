const router = require('express').Router();
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

router.post('/login', requireTrustedOrigin, loginLimiter, login);
router.get('/me', auth, me);
router.post('/logout', requireTrustedOrigin, logout);

module.exports = router;
