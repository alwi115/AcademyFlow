const router = require('express').Router();
const { auth, allowRoles } = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const requireOwnerLegalAcceptance = require('../middleware/legal-acceptance');
const c = require('../controllers/engagement.controller');

router.use(auth, tenant, requireOwnerLegalAcceptance);

router.get('/settings', allowRoles('owner','admin'), c.settings);
router.patch('/settings', allowRoles('owner','admin'), c.updateSettings);

router.get('/student/overview', allowRoles('student'), c.studentOverview);
router.post('/student/compensations/:progressId/submit', allowRoles('student'), c.submitCompensation);
router.post('/student/session-feedback', allowRoles('student'), c.sessionFeedback);

router.get('/instructor/insights', allowRoles('instructor'), c.instructorInsights);
router.get('/academy/withdrawal-risk', allowRoles('owner','admin'), c.withdrawalRisk);

router.get(
  '/quizzes/:quizId/mapping',
  allowRoles('owner','admin','content_manager','instructor'),
  c.quizMapping
);
router.patch(
  '/quizzes/:quizId/questions/:questionId/lesson',
  allowRoles('owner','admin','content_manager','instructor'),
  c.updateQuestionLesson
);

module.exports = router;
