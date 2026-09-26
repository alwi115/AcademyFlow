const router = require('express').Router();
const { auth, allowRoles } = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const c = require('../controllers/academy.controller');
const q = require('../controllers/academy-quiz.controller');
const ops = require('../controllers/academy-operations.controller');
const email = require('../controllers/email.controller');

const ACADEMY_ROLES = ['owner','admin','branch_manager','instructor','accountant','reception','content_manager','support'];
const QUIZ_MANAGERS = ['owner','admin','instructor','content_manager'];

router.use(auth, tenant, allowRoles(...ACADEMY_ROLES));

router.get('/dashboard', c.dashboard);
router.get('/options', c.options);

router.get('/users', c.listUsers);
router.post('/users', allowRoles('owner','admin'), c.createUser);

router.get('/branches', c.listBranches);
router.post('/branches', allowRoles('owner','admin','branch_manager'), c.createBranch);

router.get('/courses', c.listCourses);
router.post('/courses', allowRoles('owner','admin','content_manager','instructor'), c.createCourse);
router.patch('/courses/:id', allowRoles('owner','admin','content_manager'), ops.updateCourse);

router.get('/lessons', c.listLessons);
router.post('/lessons', allowRoles('owner','admin','content_manager','instructor'), c.createLesson);

router.get('/groups', c.listGroups);
router.post('/groups', allowRoles('owner','admin','branch_manager'), c.createGroup);
router.patch('/groups/:id', allowRoles('owner','admin','branch_manager'), ops.updateGroup);

router.get('/enrollments', c.listEnrollments);
router.post('/enrollments', allowRoles('owner','admin','reception','branch_manager'), c.createEnrollment);

router.get('/attendance', c.listAttendance);
router.post('/attendance', allowRoles('owner','admin','instructor','reception','branch_manager'), c.createAttendance);

router.get('/assessments', c.listAssessments);
router.post('/assessments', allowRoles('owner','admin','instructor','content_manager'), c.createAssessment);
router.patch('/assessments/:id', allowRoles('owner','admin','content_manager'), ops.updateAssignment);

router.get('/quizzes', allowRoles(...QUIZ_MANAGERS), q.listQuizzes);
router.post('/quizzes', allowRoles(...QUIZ_MANAGERS), q.createQuiz);
router.get('/quizzes/:id', allowRoles(...QUIZ_MANAGERS), q.quizDetails);
router.patch('/quizzes/:id', allowRoles(...QUIZ_MANAGERS), q.updateQuiz);
router.post('/quizzes/:id/questions', allowRoles(...QUIZ_MANAGERS), q.createQuestion);
router.patch('/quizzes/:id/questions/:questionId', allowRoles(...QUIZ_MANAGERS), q.updateQuestion);
router.delete('/quizzes/:id/questions/:questionId', allowRoles(...QUIZ_MANAGERS), q.deleteQuestion);
router.get('/quizzes/:id/attempts', allowRoles(...QUIZ_MANAGERS), q.listAttempts);
router.get('/quizzes/:id/attempts/:attemptId', allowRoles(...QUIZ_MANAGERS), q.attemptDetails);
router.patch('/quizzes/:id/attempts/:attemptId/questions/:questionId/grade', allowRoles(...QUIZ_MANAGERS), q.gradeShortAnswer);

router.get('/payments', allowRoles('owner','admin','accountant'), c.listPayments);
router.post('/payments', allowRoles('owner','admin','accountant'), c.createPayment);

router.get('/certificates', c.listCertificates);
router.post('/certificates', allowRoles('owner','admin','content_manager'), c.createCertificate);

router.get('/notifications', c.listNotifications);
router.post('/notifications', allowRoles('owner','admin','support'), c.createNotification);

router.get('/support', c.listSupport);
router.post('/support', c.createSupport);

router.get('/reports', allowRoles('owner','admin','accountant'), c.reports);

router.get('/settings', allowRoles('owner','admin'), c.getSettings);
router.patch('/settings', allowRoles('owner','admin'), c.updateSettings);

router.get('/email/status', allowRoles('owner','admin'), email.status);
router.post('/email/test', allowRoles('owner','admin'), email.test);

module.exports = router;
