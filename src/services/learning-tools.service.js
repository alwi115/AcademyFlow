const Academy = require('../models/Academy');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const Lesson = require('../models/Lesson');
const LessonProgress = require('../models/LessonProgress');
const Assessment = require('../models/Assessment');
const Submission = require('../models/AssignmentSubmission');
const QuizAttempt = require('../models/QuizAttempt');
const LiveSession = require('../models/LiveSession');
const Attendance = require('../models/Attendance');
const { instructorScope, enrollmentAccessFilter } = require('./instructor-scope.service');
const { safeTimeZone } = require('./timezone.service');
const { objectId } = require('../utils/security-input');

const DAY = 86400000;
const id = value => String(value?._id || value || '');
const statuses = ['active', 'paused', 'completed'];
const published = { $in: ['published', 'closed'] };
function invalid(message) { return Object.assign(new Error(message), { status: 400 }); }

async function timezone(academyId) {
  const academy = await Academy.findById(academyId).select('timezone').lean();
  return safeTimeZone(academy?.timezone || 'Asia/Muscat');
}

async function courseScope(req) {
  let filter = {};
  let enrollments = [];
  if (req.user.role === 'student') {
    enrollments = await Enrollment.find({ academyId: req.academyId, studentId: req.user.sub, status: { $in: statuses } }).lean();
    filter = { _id: { $in: enrollments.map(row => row.courseId) } };
  } else if (req.user.role === 'instructor') {
    filter = { _id: { $in: (await instructorScope(req)).contentCourseIds } };
  }
  const courses = await Course.find({ academyId: req.academyId, status: { $ne: 'archived' }, ...filter }).select('title').sort({ title: 1 }).lean();
  return { courses, enrollments };
}

function dateWindow(query, now) {
  const parse = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ? new Date(value) : new Date(NaN);
  const from = query.from === undefined ? now : parse(query.from);
  const to = query.to === undefined ? new Date(+from + 32 * DAY) : parse(query.to);
  if (!Number.isFinite(+from) || !Number.isFinite(+to) || to <= from || to - from > 62 * DAY) throw invalid('اختر فترة صحيحة لا تتجاوز 62 يومًا.');
  for (const [key, date] of [['from', from], ['to', to]]) {
    if (query[key] !== undefined && date.toISOString().replace('.000Z', 'Z') !== query[key].replace('.000Z', 'Z')) throw invalid('التاريخ غير صحيح.');
  }
  return { from, to };
}

async function calendar(req, now = new Date()) {
  const { from, to } = dateWindow(req.query, now);
  const { courses, enrollments } = await courseScope(req);
  const courseIds = courses.map(row => row._id);
  if (req.query.meta === '1') return { timezone: await timezone(req.academyId), generatedAt: now, courses: courses.map(row => ({ id: id(row), title: row.title })), events: [] };
  let selectedIds = courseIds;
  if (req.query.courseId !== undefined && req.query.courseId !== '') {
    const selected = objectId(req.query.courseId, 'معرف الدورة غير صحيح');
    selectedIds = courseIds.filter(value => id(value) === id(selected));
  }
  const base = { academyId: req.academyId, courseId: { $in: selectedIds } };
  const liveBase = { ...base, courseId: { $in: [...selectedIds, ...(!req.query.courseId && req.user.role !== 'student' ? [null] : [])] } };
  let liveScope = {};
  if (req.user.role === 'student') {
    const clauses = enrollments.map(row => ({ courseId: row.courseId, groupId: { $in: [null, ...(row.groupId ? [row.groupId] : [])] } }));
    liveScope = clauses.length ? { $or: clauses } : { _id: null };
  } else if (req.user.role === 'instructor') {
    const scope = await instructorScope(req);
    liveScope = { $or: [
      { instructorId: req.user.sub },
      { courseId: { $in: scope.directCourseIds } },
      { courseId: { $in: scope.groupCourseIds }, groupId: null },
      { groupId: { $in: scope.assignedGroupIds } }
    ] };
  }
  const [live, assessments, zone] = await Promise.all([
    LiveSession.find({ ...liveBase, ...liveScope, status: { $in: ['scheduled', 'live', 'ended'] }, startAt: { $gte: from, $lt: to } })
      .select('title courseId groupId startAt durationMinutes status').sort({ startAt: 1 }).limit(2001).lean(),
    Assessment.find({ ...base, status: published, $or: [{ dueAt: { $gte: from, $lt: to } }, { type: 'quiz', availableFrom: { $gte: from, $lt: to } }] })
      .select('title courseId type availableFrom dueAt status').sort({ dueAt: 1, availableFrom: 1 }).limit(2001).lean(),
    timezone(req.academyId)
  ]);
  if (live.length > 2000 || assessments.length > 2000) throw invalid('المواعيد كثيرة في هذه الفترة؛ اختر دورة محددة أو فترة أقصر.');
  const names = new Map(courses.map(row => [id(row), row.title]));
  const portal = req.user.role === 'student' ? 'student' : req.user.role === 'instructor' ? 'instructor' : 'academy';
  const events = live.map(row => ({ id: `live-${row._id}`, type: 'live', title: row.title, courseId: id(row.courseId), course: names.get(id(row.courseId)) || 'موعد عام', at: row.startAt,
    endAt: new Date(+row.startAt + row.durationMinutes * 60000), status: row.status, href: `/${portal}/live.html` }));
  for (const row of assessments) {
    const common = { type: row.type, title: row.title, courseId: id(row.courseId), course: names.get(id(row.courseId)), status: row.status,
      href: `/${portal}/${row.type === 'quiz' ? 'quizzes' : 'assignments'}.html` };
    if (row.type === 'quiz' && row.availableFrom >= from && row.availableFrom < to) events.push({ ...common, id: `quiz-open-${row._id}`, phase: 'open', at: row.availableFrom });
    if (row.dueAt >= from && row.dueAt < to) events.push({ ...common, id: `${row.type}-due-${row._id}`, phase: 'due', at: row.dueAt });
  }
  events.sort((a, b) => +a.at - +b.at || a.id.localeCompare(b.id));
  return { timezone: zone, from, to, generatedAt: now, courses: courses.map(row => ({ id: id(row), title: row.title })), events };
}

async function progress(req) {
  const academyId = req.academyId, studentId = req.user.sub;
  const { courses, enrollments } = await courseScope(req);
  const courseIds = courses.map(row => row._id);
  const base = { academyId, courseId: { $in: courseIds } };
  const [lessons, saved, tasks, submissions, attempts] = await Promise.all([
    Lesson.find({ ...base, status: 'published' }).select('title courseId order').sort({ order: 1, createdAt: 1, _id: 1 }).lean(),
    LessonProgress.find({ ...base, studentId }).select('lessonId completed lastOpenedAt').lean(),
    Assessment.find({ ...base, status: published }).select('title courseId type dueAt availableFrom').lean(),
    Submission.find({ ...base, studentId }).select('assessmentId').lean(),
    QuizAttempt.find({ ...base, studentId, status: { $in: ['submitted', 'pending_review', 'graded', 'expired'] } }).select('assessmentId').lean()
  ]);
  const savedMap = new Map(saved.map(row => [id(row.lessonId), row]));
  const submitted = new Set(submissions.map(row => id(row.assessmentId)));
  const attempted = new Set(attempts.map(row => id(row.assessmentId)));
  const rows = courses.map(course => {
    const enrollment = enrollments.find(row => id(row.courseId) === id(course));
    const steps = lessons.filter(row => id(row.courseId) === id(course)).map(row => ({ id: id(row), title: row.title, completed: Boolean(savedMap.get(id(row))?.completed),
      href: `/student/course.html?id=${id(course)}&lesson=${id(row)}` }));
    const completed = steps.filter(row => row.completed).length;
    const assigned = tasks.filter(row => id(row.courseId) === id(course) && (!row.dueAt || row.dueAt >= enrollment.enrolledAt));
    const summary = (type, set) => ({ total: assigned.filter(row => row.type === type).length, completed: assigned.filter(row => row.type === type && set.has(id(row))).length });
    return { id: id(course), title: course.title, status: enrollment.status, total: steps.length, completed, remaining: steps.length - completed,
      percent: steps.length ? Math.round(completed / steps.length * 100) : 0, next: steps.find(row => !row.completed) || null,
      assignments: summary('assignment', submitted), quizzes: summary('quiz', attempted), steps };
  });
  return { courses: rows, total: rows.reduce((n, row) => n + row.total, 0), completed: rows.reduce((n, row) => n + row.completed, 0) };
}

// Follow-up signals only: no grading, suspension, or communication is automated.
// Missing attendance is unknown, never inferred as absence.
async function followUp(req, now = new Date()) {
  const academyId = req.academyId;
  const since = new Date(+now - 30 * DAY);
  const page = req.query.page === undefined ? 1 : Number(req.query.page);
  if (!Number.isInteger(page) || page < 1 || page > 100000) throw invalid('رقم الصفحة غير صحيح.');
  const extra = { status: 'active' };
  if (req.query.courseId) extra.courseId = objectId(req.query.courseId, 'معرف الدورة غير صحيح');
  const filter = req.user.role === 'instructor' ? await enrollmentAccessFilter(req, extra) : { academyId, ...extra };
  const { courses } = await courseScope(req);
  filter.courseId = { $in: courses.filter(row => !extra.courseId || id(row) === id(extra.courseId)).map(row => row._id) };
  const [total, enrollments, zone] = await Promise.all([
    Enrollment.countDocuments(filter),
    Enrollment.find(filter).sort({ _id: 1 }).skip((page - 1) * 50).limit(50).populate({ path: 'studentId', match: { academyId, active: true }, select: 'name' }).lean(),
    timezone(academyId)
  ]);
  const valid = enrollments.filter(row => row.studentId);
  const pairs = valid.map(row => ({ studentId: row.studentId._id, courseId: row.courseId }));
  const scope = { academyId, ...(pairs.length ? { $or: pairs } : { _id: null }) };
  const courseIds = valid.map(row => row.courseId);
  const [attendance, assignments, submissions] = await Promise.all([
    Attendance.find({ ...scope, date: { $gte: since, $lte: now } }).select('studentId courseId groupId date status').lean(),
    Assessment.find({ academyId, courseId: { $in: courseIds }, type: 'assignment', status: published, dueAt: { $gte: since, $lt: now } }).select('title courseId dueAt').lean(),
    Submission.find(scope).select('studentId courseId assessmentId').lean()
  ]);
  const sent = new Set(submissions.map(row => `${id(row.studentId)}:${id(row.assessmentId)}`));
  const names = new Map(courses.map(row => [id(row), row.title]));
  const rows = valid.map(row => {
    const studentId = id(row.studentId), courseId = id(row.courseId);
    const days = new Map();
    for (const record of attendance) {
      if (id(record.studentId) !== studentId || id(record.courseId) !== courseId || record.date < row.enrolledAt || (record.groupId && id(record.groupId) !== id(row.groupId))) continue;
      const key = record.date.toISOString().slice(0, 10);
      // A present/late/excused mark wins over a duplicate absent mark for the same date.
      if (!days.has(key) || record.status !== 'absent') days.set(key, record.status);
    }
    const absences = [...days.values()].filter(value => value === 'absent').length;
    const overdue = assignments.filter(task => id(task.courseId) === courseId && task.dueAt >= row.enrolledAt && !sent.has(`${studentId}:${id(task)}`));
    const reasons = [];
    if (absences >= 2) reasons.push({ code: 'absence', count: absences, label: `${absences} أيام غياب مسجلة` });
    if (overdue.length >= 2) reasons.push({ code: 'overdue', count: overdue.length, label: `${overdue.length} واجبات متأخرة دون تسليم` });
    return { enrollmentId: id(row), student: { id: studentId, name: row.studentId.name }, course: { id: courseId, title: names.get(courseId) },
      absences, recordedDays: days.size, overdue: overdue.map(task => ({ id: id(task), title: task.title, dueAt: task.dueAt })), reasons,
      priority: reasons.length > 1 ? 'high' : reasons.length ? 'follow_up' : 'none' };
  });
  rows.sort((a, b) => b.reasons.length - a.reasons.length || b.overdue.length - a.overdue.length);
  return { since, generatedAt: now, timezone: zone, page, pages: Math.max(1, Math.ceil(total / 50)), totalEnrollments: total,
    courses: courses.map(row => ({ id: id(row), title: row.title })), rows, policy: { days: 30, absentDays: 2, overdueAssignments: 2, attendanceSource: 'manual' } };
}

module.exports = { calendar, progress, followUp, dateWindow };
