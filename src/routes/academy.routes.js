const router = require('express').Router();
const { auth, allowRoles } = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const c = require('../controllers/academy.controller');
const q = require('../controllers/academy-quiz.controller');
const ops = require('../controllers/academy-operations.controller');
const email = require('../controllers/email.controller');

const ACADEMY_ROLES = ['owner','admin','branch_manager','accountant','reception','content_manager','support'];
const ADMIN_ROLES = ['owner','admin'];
const PEOPLE_ROLES = ['owner','admin','branch_manager','reception','content_manager'];
const OPERATIONS_ROLES = ['owner','admin','branch_manager','reception'];
const CONTENT_ROLES = ['owner','admin','content_manager'];
const FINANCE_ROLES = ['owner','admin','accountant'];
const COMMUNICATION_ROLES = ['owner','admin','support'];
const QUIZ_REVIEW_ROLES = ['owner','admin'];

router.use(auth, tenant, allowRoles(...ACADEMY_ROLES));

router.get('/dashboard', c.dashboard);
router.get('/options', c.options);

router.get('/users', allowRoles(...PEOPLE_ROLES), c.listUsers);
router.post('/users', allowRoles(...ADMIN_ROLES), c.createUser);
router.patch('/users/:id', allowRoles(...ADMIN_ROLES), c.updateUser);

router.get('/branches', allowRoles(...OPERATIONS_ROLES), c.listBranches);
router.post('/branches', allowRoles(...ADMIN_ROLES), c.createBranch);

router.get('/courses', allowRoles('owner','admin','branch_manager','reception','content_manager'), c.listCourses);
router.post('/courses', allowRoles(...CONTENT_ROLES), c.createCourse);
router.patch('/courses/:id', allowRoles(...CONTENT_ROLES), ops.updateCourse);

router.get('/lessons', allowRoles(...CONTENT_ROLES), c.listLessons);
router.post('/lessons', allowRoles(...CONTENT_ROLES), c.createLesson);

router.get('/groups', allowRoles(...OPERATIONS_ROLES), c.listGroups);
router.post('/groups', allowRoles('owner','admin','branch_manager'), c.createGroup);
router.patch('/groups/:id', allowRoles('owner','admin','branch_manager'), ops.updateGroup);

router.get('/enrollments', allowRoles(...OPERATIONS_ROLES), c.listEnrollments);
router.post('/enrollments', allowRoles(...OPERATIONS_ROLES), c.createEnrollment);

router.get('/attendance', allowRoles(...OPERATIONS_ROLES), c.listAttendance);
router.post('/attendance', allowRoles(...OPERATIONS_ROLES), c.createAttendance);

router.get('/assessments', allowRoles(...CONTENT_ROLES), c.listAssessments);
router.post('/assessments', allowRoles(...CONTENT_ROLES), c.createAssessment);
router.patch('/assessments/:id', allowRoles(...CONTENT_ROLES), ops.updateAssignment);

router.get('/quizzes', allowRoles(...CONTENT_ROLES), q.listQuizzes);
router.post('/quizzes', allowRoles(...CONTENT_ROLES), q.createQuiz);
router.get('/quizzes/:id', allowRoles(...CONTENT_ROLES), q.quizDetails);
router.patch('/quizzes/:id', allowRoles(...CONTENT_ROLES), q.updateQuiz);
router.post('/quizzes/:id/questions', allowRoles(...CONTENT_ROLES), q.createQuestion);
router.patch('/quizzes/:id/questions/:questionId', allowRoles(...CONTENT_ROLES), q.updateQuestion);
router.delete('/quizzes/:id/questions/:questionId', allowRoles(...CONTENT_ROLES), q.deleteQuestion);
router.get('/quizzes/:id/attempts', allowRoles(...QUIZ_REVIEW_ROLES), q.listAttempts);
router.get('/quizzes/:id/attempts/:attemptId', allowRoles(...QUIZ_REVIEW_ROLES), q.attemptDetails);
router.patch('/quizzes/:id/attempts/:attemptId/questions/:questionId/grade', allowRoles(...QUIZ_REVIEW_ROLES), q.gradeShortAnswer);

router.get('/payments', allowRoles(...FINANCE_ROLES), c.listPayments);
router.post('/payments', allowRoles(...FINANCE_ROLES), c.createPayment);

router.get('/certificates', allowRoles(...CONTENT_ROLES), c.listCertificates);
router.post('/certificates', allowRoles(...CONTENT_ROLES), c.createCertificate);

router.get('/notifications', allowRoles(...COMMUNICATION_ROLES), c.listNotifications);
router.post('/notifications', allowRoles(...COMMUNICATION_ROLES), c.createNotification);

router.get('/support', c.listSupport);
router.post('/support', c.createSupport);

router.get('/reports', allowRoles(...FINANCE_ROLES), c.reports);

router.get('/settings', allowRoles(...ADMIN_ROLES), c.getSettings);
router.patch('/settings', allowRoles(...ADMIN_ROLES), c.updateSettings);

router.get('/email/status', allowRoles(...ADMIN_ROLES), email.status);
router.post('/email/test', allowRoles(...ADMIN_ROLES), email.test);

module.exports = router;
