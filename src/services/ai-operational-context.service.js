const Academy = require('../models/Academy');
const Enrollment = require('../models/Enrollment');
const Attendance = require('../models/Attendance');
const LiveSession = require('../models/LiveSession');
const LessonProgress = require('../models/LessonProgress');
const {
  enrollmentAccessFilter,
  attendanceAccessFilter
} = require('./instructor-scope.service');

const ACTIVE_ENROLLMENT_STATUSES = ['active', 'paused', 'completed'];
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function asId(value) {
  return String(value || '');
}

function percent(value) {
  const number = Number(value || 0);
  return Math.max(0, Math.min(100, Math.round(number)));
}

function courseMap(courses) {
  return new Map((courses || []).map(course => [asId(course._id), course]));
}

function statusCounter(rows) {
  const result = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const row of rows || []) {
    if (Object.prototype.hasOwnProperty.call(result, row.status)) result[row.status] += 1;
  }
  return result;
}

function average(values) {
  const safe = (values || []).map(Number).filter(Number.isFinite);
  if (!safe.length) return 0;
  return Math.round(safe.reduce((sum, value) => sum + value, 0) / safe.length);
}

async function timezoneFor(req) {
  const academy = await Academy.findById(req.academyId).select('timezone');
  return academy?.timezone || 'Asia/Muscat';
}

function formatDateTime(value, timezone) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('ar-OM', {
      timeZone: timezone,
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value));
  } catch {
    return new Date(value).toISOString();
  }
}

function studentCourseLine(course, enrollment, attendanceRows, progressRows) {
  const attendance = statusCounter(attendanceRows);
  const completedLessons = progressRows.filter(row => row.completed).length;
  const watchedAverage = average(progressRows.map(row => row.watchedPercent));

  return [
    'الدورة: ' + course.title,
    'التقدم المسجل: ' + percent(enrollment?.progress) + '%',
    'الحضور آخر 30 يوم: حاضر ' + attendance.present +
      '، غائب ' + attendance.absent +
      '، متأخر ' + attendance.late +
      '، بعذر ' + attendance.excused,
    'الدروس المكتملة المسجلة: ' + completedLessons,
    progressRows.length ? 'متوسط المشاهدة للدروس التي بدأها الطالب: ' + watchedAverage + '%' : ''
  ].filter(Boolean).join(' | ');
}

function instructorCourseLine(course, enrollments, attendanceRows) {
  const attendance = statusCounter(attendanceRows);
  const active = enrollments.filter(row => row.status === 'active').length;
  const paused = enrollments.filter(row => row.status === 'paused').length;
  const completed = enrollments.filter(row => row.status === 'completed').length;
  const progressAverage = average(enrollments.map(row => row.progress));

  return [
    'الدورة: ' + course.title,
    'الطلاب: ' + enrollments.length +
      ' (نشط ' + active + '، متوقف ' + paused + '، مكتمل ' + completed + ')',
    'متوسط التقدم: ' + progressAverage + '%',
    'الحضور آخر 30 يوم: حاضر ' + attendance.present +
      '، غائب ' + attendance.absent +
      '، متأخر ' + attendance.late +
      '، بعذر ' + attendance.excused
  ].join(' | ');
}

async function studentContext(req, courses) {
  const ids = (courses || []).map(course => course._id);
  if (!ids.length) return 'لا توجد بيانات تشغيلية متاحة للطالب حاليًا.';

  const since = new Date(Date.now() - THIRTY_DAYS_MS);
  const [enrollments, timezone] = await Promise.all([
    Enrollment.find({
      academyId: req.academyId,
      studentId: req.user.sub,
      courseId: { $in: ids },
      status: { $in: ACTIVE_ENROLLMENT_STATUSES }
    }).select('courseId groupId status progress'),
    timezoneFor(req)
  ]);

  const sessionScope = enrollments.map(row => (
    row.groupId
      ? {
          courseId: row.courseId,
          $or: [{ groupId: row.groupId }, { groupId: null }]
        }
      : {
          courseId: row.courseId,
          groupId: null
        }
  ));

  const [attendance, progress, sessions] = await Promise.all([
    Attendance.find({
      academyId: req.academyId,
      studentId: req.user.sub,
      courseId: { $in: ids },
      date: { $gte: since }
    }).select('courseId status date'),
    LessonProgress.find({
      academyId: req.academyId,
      studentId: req.user.sub,
      courseId: { $in: ids }
    }).select('courseId completed watchedPercent'),
    sessionScope.length
      ? LiveSession.find({
          academyId: req.academyId,
          status: { $in: ['scheduled', 'live'] },
          startAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) },
          $or: sessionScope
        })
          .select('courseId groupId title startAt status')
          .sort({ startAt: 1 })
          .limit(6)
      : []
  ]);

  const byCourse = courseMap(courses);
  const lines = [];

  for (const course of courses) {
    const id = asId(course._id);
    lines.push(studentCourseLine(
      course,
      enrollments.find(row => asId(row.courseId) === id),
      attendance.filter(row => asId(row.courseId) === id),
      progress.filter(row => asId(row.courseId) === id)
    ));
  }

  if (sessions.length) {
    lines.push('الجلسات القادمة:');
    for (const session of sessions) {
      const course = byCourse.get(asId(session.courseId));
      lines.push(
        '- ' + session.title +
        (course ? ' — ' + course.title : '') +
        ' — ' + formatDateTime(session.startAt, timezone) +
        (session.status === 'live' ? ' (مباشرة الآن)' : '')
      );
    }
  } else {
    lines.push('الجلسات القادمة: لا توجد جلسات مجدولة ضمن الدورات والمجموعات المتاحة للطالب.');
  }

  return lines.join('\\n');
}

async function instructorContext(req, courses) {
  const ids = (courses || []).map(course => course._id);
  if (!ids.length) return 'لا توجد بيانات تشغيلية متاحة للمدرب حاليًا.';

  const since = new Date(Date.now() - THIRTY_DAYS_MS);
  const [enrollmentFilter, attendanceFilter, timezone] = await Promise.all([
    enrollmentAccessFilter(req, {
      courseId: { $in: ids },
      status: { $in: ACTIVE_ENROLLMENT_STATUSES }
    }),
    attendanceAccessFilter(req, {
      courseId: { $in: ids },
      date: { $gte: since }
    }),
    timezoneFor(req)
  ]);

  const [enrollments, attendance, sessions] = await Promise.all([
    Enrollment.find(enrollmentFilter).select('courseId status progress studentId'),
    Attendance.find(attendanceFilter).select('courseId status date studentId'),
    LiveSession.find({
      academyId: req.academyId,
      courseId: { $in: ids },
      instructorId: req.user.sub,
      status: { $in: ['scheduled', 'live'] },
      startAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) }
    })
      .select('courseId title startAt status')
      .sort({ startAt: 1 })
      .limit(6)
  ]);

  const byCourse = courseMap(courses);
  const lines = [];

  for (const course of courses) {
    const id = asId(course._id);
    lines.push(instructorCourseLine(
      course,
      enrollments.filter(row => asId(row.courseId) === id),
      attendance.filter(row => asId(row.courseId) === id)
    ));
  }

  if (sessions.length) {
    lines.push('الجلسات القادمة التي يديرها المدرب:');
    for (const session of sessions) {
      const course = byCourse.get(asId(session.courseId));
      lines.push(
        '- ' + session.title +
        (course ? ' — ' + course.title : '') +
        ' — ' + formatDateTime(session.startAt, timezone) +
        (session.status === 'live' ? ' (مباشرة الآن)' : '')
      );
    }
  } else {
    lines.push('الجلسات القادمة: لا توجد جلسات يديرها المدرب ضمن النطاق المحدد.');
  }

  return lines.join('\n');
}

async function operationalContext(req, courses) {
  if (req.user.role === 'student') return studentContext(req, courses);
  if (req.user.role === 'instructor') return instructorContext(req, courses);
  return 'لا توجد بيانات تشغيلية مخصصة لهذا الدور.';
}

module.exports = {
  operationalContext
};
