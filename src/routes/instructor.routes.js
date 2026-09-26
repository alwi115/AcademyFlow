const router = require('express').Router();
const { auth, allowRoles } = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const core = require('../controllers/instructor-core.controller');
const teaching = require('../controllers/instructor-teaching.controller');
const live = require('../controllers/instructor-live.controller');
const profile = require('../controllers/instructor-profile.controller');

router.use(auth, tenant, allowRoles('instructor'));

router.get('/options', core.options);
router.get('/dashboard', core.dashboard);
router.get('/courses', core.courses);
router.get('/groups', core.groups);
router.get('/students', core.students);
router.get('/gradebook', core.gradebook);

router.get('/lessons', teaching.lessons);
router.post('/lessons', teaching.createLesson);
router.patch('/lessons/:id', teaching.updateLesson);

router.get('/attendance', teaching.attendance);
router.post('/attendance', teaching.createAttendance);

router.get('/assignments', teaching.assignments);
router.post('/assignments', teaching.createAssignment);
router.patch('/assignments/:id', teaching.updateAssignment);
router.get('/assignments/:id/submissions', teaching.assignmentSubmissions);
router.patch('/assignments/:id/submissions/:submissionId', teaching.gradeAssignment);

router.get('/notifications', teaching.notifications);
router.post('/notifications', teaching.createNotification);

router.get('/live', live.liveSessions);
router.post('/live', live.createLiveSession);
router.get('/live/:id/start', live.liveStart);
router.get('/live/:id/attendance', live.liveAttendance);
router.patch('/live/:id/attendance/:studentId', live.updateLiveAttendance);

router.get('/profile', profile.profile);
router.patch('/profile', profile.updateProfile);
router.post('/profile/password', profile.changePassword);

module.exports = router;
