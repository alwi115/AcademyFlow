const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const c = require('../controllers/public.controller');

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
router.post('/privacy-requests', privacyLimiter, c.createPrivacyRequest);

module.exports = router;
