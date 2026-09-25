const router = require('express').Router();
const { auth, allowRoles } = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const c = require('../controllers/academy.controller');

const ACADEMY_ROLES = ['owner','admin','branch_manager','instructor','accountant','reception','content_manager','support'];

router.use(auth, tenant, allowRoles(...ACADEMY_ROLES));

router.get('/dashboard', c.dashboard);
router.get('/options', c.options);

router.get('/users', c.listUsers);
router.post('/users', allowRoles('owner','admin'), c.createUser);

router.get('/branches', c.listBranches);
router.post('/branches', allowRoles('owner','admin','branch_manager'), c.createBranch);

router.get('/courses', c.listCourses);
router.post('/courses', allowRoles('owner','admin','content_manager','instructor'), c.createCourse);

router.get('/lessons', c.listLessons);
router.post('/lessons', allowRoles('owner','admin','content_manager','instructor'), c.createLesson);

router.get('/groups', c.listGroups);
router.post('/groups', allowRoles('owner','admin','branch_manager'), c.createGroup);

router.get('/enrollments', c.listEnrollments);
router.post('/enrollments', allowRoles('owner','admin','reception','branch_manager'), c.createEnrollment);

router.get('/attendance', c.listAttendance);
router.post('/attendance', allowRoles('owner','admin','instructor','reception','branch_manager'), c.createAttendance);

router.get('/assessments', c.listAssessments);
router.post('/assessments', allowRoles('owner','admin','instructor','content_manager'), c.createAssessment);

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

module.exports = router;
