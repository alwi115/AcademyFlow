const router = require('express').Router();
const { auth, allowRoles } = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const c = require('../controllers/student.controller');
const q = require('../controllers/student-quiz.controller');

router.use(auth, tenant, allowRoles('student'));

router.get('/dashboard', c.dashboard);
router.get('/courses', c.courses);
router.get('/courses/:id', c.courseDetails);
router.post('/lessons/:lessonId/progress', c.setLessonProgress);

router.get('/live', c.liveSessions);

router.get('/assessments', c.assessments);
router.post('/assignments/:id/submission', c.submitAssignment);

router.get('/quizzes', q.listQuizzes);
router.post('/quizzes/:id/start', q.startQuiz);
router.get('/quiz-attempts/:attemptId', q.getAttempt);
router.patch('/quiz-attempts/:attemptId/questions/:questionId', q.saveAnswer);
router.post('/quiz-attempts/:attemptId/submit', q.submitQuiz);
router.get('/quiz-attempts/:attemptId/result', q.quizResult);

router.get('/payments', c.payments);
router.get('/certificates', c.certificates);
router.get('/notifications', c.notifications);

router.get('/profile', c.profile);
router.patch('/profile', c.updateProfile);
router.post('/profile/password', c.changePassword);

module.exports = router;
