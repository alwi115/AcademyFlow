require('./test-safety').assertSafeTestUri();
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Academy = require('../src/models/Academy');
const User = require('../src/models/User');
const Course = require('../src/models/Course');
const Group = require('../src/models/Group');
const Enrollment = require('../src/models/Enrollment');
const Lesson = require('../src/models/Lesson');
const Progress = require('../src/models/LessonProgress');
const Assessment = require('../src/models/Assessment');
const Submission = require('../src/models/AssignmentSubmission');
const Attendance = require('../src/models/Attendance');
const Live = require('../src/models/LiveSession');
const { sign } = require('../src/controllers/auth.controller');
const { CURRENT_LEGAL_VERSION } = require('../src/config/legal');
let server;
async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  await require('./test-safety').safeDropDatabase(mongoose.connection);
  const now = new Date(), ago = days => new Date(+now - days * 86400000);
  const academy = await Academy.create({ name: 'Learning tests', code: 'LEARN-1', slug: 'learning-tests', status: 'active', timezone: 'Asia/Dubai' });
  const foreign = await Academy.create({ name: 'Other tenant', code: 'LEARN-2', slug: 'other-learning', status: 'active' });
  const passwordHash = await require('bcryptjs').hash('TestOnlyPassword123!', 4);
  const makeUser = (role, name, academyId = academy._id) => User.create({ role, name, email: name + '@example.test', academyId, passwordHash,
    legalAcceptance: { acceptedAt: now, termsVersion: CURRENT_LEGAL_VERSION, privacyVersion: CURRENT_LEGAL_VERSION, dpaVersion: CURRENT_LEGAL_VERSION } });
  const [owner, student, peer, instructor, teacher, accountant, outsider] = await Promise.all([
    makeUser('owner', 'Owner'), makeUser('student', 'Student'), makeUser('student', 'Peer'), makeUser('instructor', 'GroupTeacher'), makeUser('instructor', 'CourseTeacher'), makeUser('accountant', 'Accountant'), makeUser('owner', 'Outsider', foreign._id)
  ]);
  const course = await Course.create({ academyId: academy._id, title: 'Scoped course', instructorId: teacher._id, status: 'active' });
  const unrelated = await Course.create({ academyId: academy._id, title: 'Not enrolled', status: 'active' });
  const foreignCourse = await Course.create({ academyId: foreign._id, title: 'Foreign course', status: 'active' });
  const [ownGroup, otherGroup] = await Group.create([
    { academyId: academy._id, courseId: course._id, instructorId: instructor._id, name: 'Own' },
    { academyId: academy._id, courseId: course._id, instructorId: teacher._id, name: 'Other' }
  ]);
  const enrollment = await Enrollment.create({ academyId: academy._id, courseId: course._id, studentId: student._id, groupId: ownGroup._id, enrolledAt: ago(20) });
  await Enrollment.create({ academyId: academy._id, courseId: course._id, studentId: peer._id, groupId: otherGroup._id, enrolledAt: ago(20) });
  const lessons = await Lesson.create([
    { academyId: academy._id, courseId: course._id, title: 'First', order: 1, status: 'published' },
    { academyId: academy._id, courseId: course._id, title: 'Next', order: 2, status: 'published' },
    { academyId: academy._id, courseId: course._id, title: 'Unpublished', order: 3, status: 'draft' }
  ]);
  await Progress.create([lessons[0], lessons[2]].map(lesson => ({ academyId: academy._id, studentId: student._id, courseId: course._id, lessonId: lesson._id, completed: true })));
  const assignment = (title, dueAt, extras = {}) => Assessment.create({ academyId: academy._id, courseId: course._id, type: 'assignment', title, status: 'published', dueAt, ...extras });
  const [late1, late2, done] = await Promise.all([assignment('Late one', ago(2)), assignment('Late two', ago(3)), assignment('Submitted', ago(4))]);
  await Promise.all([
    assignment('Before enrollment', ago(25)), assignment('Old', ago(45)), assignment('Draft task', ago(1), { status: 'draft' }),
    assignment('Future assignment', ago(-2)), assignment('Other course task', ago(-1), { courseId: unrelated._id }),
    assignment('Foreign task', ago(-1), { academyId: foreign._id, courseId: foreignCourse._id }),
    assignment('Quiz', ago(-2), { type: 'quiz', availableFrom: ago(-1) }),
    Submission.create({ academyId: academy._id, studentId: student._id, courseId: course._id, assessmentId: done._id, answerText: 'Submitted' })
  ]);
  for (const [day, status] of [[1, 'absent'], [2, 'absent'], [3, 'excused'], [4, 'late'], [25, 'absent']]) {
    await Attendance.create({ academyId: academy._id, studentId: student._id, courseId: course._id, groupId: ownGroup._id, date: ago(day), status });
  }
  await Attendance.create({ academyId: academy._id, studentId: student._id, courseId: course._id, groupId: otherGroup._id, date: ago(5), status: 'absent' });
  for (const [title, groupId, status] of [['Shared', null, 'scheduled'], ['My group', ownGroup._id, 'scheduled'], ['Other group', otherGroup._id, 'scheduled'], ['Cancelled', ownGroup._id, 'cancelled']]) {
    await Live.create({ academyId: academy._id, courseId: course._id, instructorId: teacher._id, title, groupId, status, startAt: ago(-1) });
  }
  server = require('../src/server').app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function get(route, user) {
    const res = await fetch(base + route, { headers: user ? { Authorization: 'Bearer ' + sign(user) } : {} });
    return { status: res.status, body: await res.json() };
  }
  const success = async (route, user) => { const result = await get(route, user); assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body; };
  const calendar = await success('/api/student/calendar', student);
  assert.equal(calendar.timezone, 'Asia/Dubai');
  assert.deepEqual(calendar.events.filter(row => row.type === 'live').map(row => row.title).sort(), ['My group', 'Shared']);
  assert.equal(calendar.events.filter(row => row.type === 'quiz').length, 2);
  assert.equal(calendar.events.filter(row => row.type === 'assignment').length, 1);
  assert.ok(calendar.events.every(row => !('zoomStartUrl' in row) && !('zoomJoinUrl' in row)));
  assert.equal((await success(`/api/student/calendar?courseId=${foreignCourse._id}`, student)).events.length, 0);
  assert.equal((await success('/api/academy/calendar', outsider)).courses[0].title, 'Foreign course');
  const teacherCalendar = await success('/api/instructor/calendar', instructor);
  assert.deepEqual(teacherCalendar.events.filter(row => row.type === 'live').map(row => row.title).sort(), ['My group', 'Shared']);
  await Live.create({ academyId: academy._id, title: 'General meeting', instructorId: instructor._id, startAt: ago(-1) });
  assert.ok((await success('/api/instructor/calendar', instructor)).events.some(row => row.title === 'General meeting'));
  assert.ok(!(await success('/api/student/calendar', student)).events.some(row => row.title === 'General meeting'));
  const meta = await success('/api/student/calendar?meta=1', student);
  assert.equal(meta.courses.length, 1); assert.equal(meta.events.length, 0);
  assert.equal((await get('/api/student/calendar?from=2026-02-31T00:00:00Z&to=2026-03-10T00:00:00Z', student)).status, 400);
  assert.equal((await get('/api/student/calendar?from=2026-01-01T00:00:00Z&to=2027-01-01T00:00:00Z', student)).status, 400);
  assert.equal((await get('/api/student/calendar?courseId=bad', student)).status, 400);
  assert.equal((await get('/api/student/calendar')).status, 401);
  for (const route of ['/api/academy/calendar', '/api/academy/follow-up']) assert.equal((await get(route, accountant)).status, 403);
  assert.equal((await get('/api/instructor/follow-up', student)).status, 403);
  const progress = await success('/api/student/progress', student);
  assert.equal(progress.courses.length, 1);
  assert.equal(progress.total, 2); assert.equal(progress.completed, 1);
  assert.equal(progress.courses[0].percent, 50); assert.equal(progress.courses[0].next.id, String(lessons[1]._id));
  assert.ok(progress.courses[0].next.href.endsWith('lesson=' + lessons[1]._id));
  const details = await success('/api/student/courses/' + course._id, student);
  assert.equal(details.progress.progress, 50, 'draft completed lesson must not inflate original course progress');
  assert.equal((await success('/api/student/progress', peer)).completed, 0);
  const follow = await success('/api/instructor/follow-up', instructor);
  assert.equal(follow.rows.length, 1); assert.equal(follow.rows[0].student.id, String(student._id));
  assert.equal(follow.rows[0].absences, 2); assert.equal(follow.rows[0].overdue.length, 2);
  assert.equal(follow.rows[0].priority, 'high');
  assert.equal((await success('/api/academy/follow-up', owner)).rows.length, 2);
  assert.equal((await success('/api/academy/follow-up', outsider)).rows.length, 0);
  assert.equal((await success('/api/instructor/follow-up?courseId=' + unrelated._id, instructor)).rows.length, 0);
  assert.equal((await get('/api/academy/follow-up?page=-1', owner)).status, 400);
  assert.equal((await success('/api/academy/follow-up?page=2', owner)).rows.length, 0);
  // Resolving an issue clears its signal on the next read, without persistent stale alerts.
  await Submission.create({ academyId: academy._id, studentId: student._id, courseId: course._id, assessmentId: late1._id });
  await Attendance.updateMany({ academyId: academy._id, studentId: student._id }, { $set: { status: 'present' } });
  assert.equal((await success('/api/instructor/follow-up', instructor)).rows[0].reasons.length, 0);
  await Enrollment.updateOne({ _id: enrollment._id }, { $set: { status: 'paused' } });
  assert.equal((await success('/api/instructor/follow-up', instructor)).rows.length, 0);
  await Enrollment.updateOne({ _id: enrollment._id }, { $set: { status: 'cancelled' } });
  assert.equal((await success('/api/student/calendar', student)).events.length, 0);
  assert.equal((await success('/api/student/progress', student)).courses.length, 0);
  // Calendar export is tested in a JS sandbox, not a browser or a live website.
  const context = vm.createContext({ window: {}, TextEncoder, Date });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/learning-tools.js'), 'utf8'), context);
  const exported = context.window.AFLearning.ics([{ ...calendar.events[0], title: 'عنوان طويل، '.repeat(35) + '\r\nBEGIN:VEVENT', at: ago(-1), status: 'scheduled' }], 'https://example.test', now);
  assert.equal(exported.split('\r\n').filter(line => line === 'BEGIN:VEVENT').length, 1);
  assert.ok(exported.split('\r\n').every(line => Buffer.byteLength(line) <= 75));
  assert.ok(exported.includes('TRIGGER:-PT30M'));
  assert.ok(exported.includes('DTSTART:' + ago(-1).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')));
  await require('./learning-ui-test')();
  console.log('Learning tools passed: calendar scopes/dates, student progress, follow-up rules/isolation/resolution, RBAC and safe calendar reminders.');
}
main().catch(err => { console.error(err); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
});
