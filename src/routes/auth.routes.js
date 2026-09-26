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

router.post('/login', loginLimiter, login);
router.get('/me', auth, me);
router.post('/logout', logout);

module.exports = router;
