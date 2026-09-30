const router = require('express').Router();
const { auth, allowRoles } = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const core = require('../controllers/instructor-core.controller');
const teaching = require('../controllers/instructor-teaching.controller');
const live = require('../controllers/instructor-live.controller');
const profile = require('../controllers/instructor-profile.controller');
const quizzes = require('../controllers/academy-quiz.controller');

router.use(auth, tenant, allowRoles('instructor'));

router.get('/options', core.options);
router.get('/dashboard', core.dashboard);
router.get('/courses', core.courses);
router.patch('/courses/:id', core.updateCourse);
router.get('/groups', core.groups);
router.patch('/groups/:id', core.updateGroup);
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
router.get('/live-series', live.listLiveSeries);
router.post('/live-series', live.createLiveSeries);
router.patch('/live-series/:seriesId/cancel-future', live.cancelLiveSeriesFuture);
router.post('/live', live.createLiveSession);
router.patch('/live/:id', live.updateLiveSession);
router.get('/live/:id/start', live.liveStart);
router.get('/live/:id/attendance', live.liveAttendance);
router.patch('/live/:id/attendance/:studentId', live.updateLiveAttendance);

router.get('/quizzes', quizzes.listQuizzes);
router.post('/quizzes', quizzes.createQuiz);
router.get('/quizzes/:id', quizzes.quizDetails);
router.patch('/quizzes/:id', quizzes.updateQuiz);
router.post('/quizzes/:id/questions', quizzes.createQuestion);
router.patch('/quizzes/:id/questions/:questionId', quizzes.updateQuestion);
router.delete('/quizzes/:id/questions/:questionId', quizzes.deleteQuestion);
router.get('/quizzes/:id/attempts', quizzes.listAttempts);
router.get('/quizzes/:id/attempts/:attemptId', quizzes.attemptDetails);
router.patch('/quizzes/:id/attempts/:attemptId/questions/:questionId/grade', quizzes.gradeShortAnswer);

router.get('/profile', profile.profile);
router.patch('/profile', profile.updateProfile);
router.post('/profile/password', require('../controllers/account-security.controller').changePassword);

module.exports = router;
