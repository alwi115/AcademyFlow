const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { auth, allowRoles } = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const controller = require('../controllers/ai.controller');

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Math.max(5, Math.min(100, Number(process.env.ACADEMYFLOW_AI_RATE_LIMIT || 30))),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'وصلت للحد المؤقت لاستخدام AcademyFlow AI. جرّب بعد قليل.' }
});

const AI_ROLES = [
  'owner',
  'admin',
  'branch_manager',
  'accountant',
  'reception',
  'content_manager',
  'support',
  'student',
  'instructor'
];

router.use(auth, tenant, allowRoles(...AI_ROLES), aiLimiter);

router.get('/context', controller.context);
router.post('/chat', controller.chat);
router.post('/summarize', controller.summarize);
router.post('/quiz-draft', controller.createQuizDraft);

module.exports = router;
