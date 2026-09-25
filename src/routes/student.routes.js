const router = require('express').Router();
const { auth, allowRoles } = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const c = require('../controllers/student.controller');

router.use(auth, tenant, allowRoles('student'));

router.get('/dashboard', c.dashboard);
router.get('/courses', c.courses);
router.get('/courses/:id', c.courseDetails);
router.post('/lessons/:lessonId/progress', c.setLessonProgress);

router.get('/live', c.liveSessions);

router.get('/assessments', c.assessments);
router.post('/assignments/:id/submission', c.submitAssignment);

router.get('/payments', c.payments);
router.get('/certificates', c.certificates);
router.get('/notifications', c.notifications);

router.get('/profile', c.profile);
router.patch('/profile', c.updateProfile);
router.post('/profile/password', c.changePassword);

module.exports = router;
