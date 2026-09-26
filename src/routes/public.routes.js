const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const c = require('../controllers/public.controller');

function requireSameOrigin(req, res, next) {
  const origin = String(req.get('origin') || '').trim();
  if (!origin) return next();

  const requestOrigin = `${req.protocol}://${req.get('host')}`;
  if (origin !== requestOrigin) {
    return res.status(403).json({ message: 'Cross-site request blocked' });
  }

  next();
}

const privacyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    message: 'تم إرسال عدد كبير من الطلبات. حاول لاحقًا.'
  }
});

router.get('/legal-config', c.legalConfig);
router.post('/privacy-requests', requireSameOrigin, privacyLimiter, c.createPrivacyRequest);

module.exports = router;
