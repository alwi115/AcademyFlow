const Course = require('../models/Course');
const Group = require('../models/Group');
const Enrollment = require('../models/Enrollment');

async function manageableCourseIds(req) {
  const [courses, groups] = await Promise.all([
    Course.find({
      academyId: req.academyId,
      instructorId: req.user.sub,
      status: { $ne: 'archived' }
    }).select('_id'),
    Group.find({
      academyId: req.academyId,
      instructorId: req.user.sub,
      status: { $ne: 'cancelled' }
    }).select('courseId')
  ]);

  return [...new Set([
    ...courses.map(row => String(row._id)),
    ...groups.map(row => String(row.courseId)).filter(Boolean)
  ])];
}

async function assertCourse(req, courseId) {
  const ids = await manageableCourseIds(req);

  if (!ids.includes(String(courseId))) {
    const err = new Error('لا تملك صلاحية إدارة هذه الدورة');
    err.status = 403;
    throw err;
  }

  const course = await Course.findOne({
    _id: courseId,
    academyId: req.academyId
  });

  if (!course) {
    const err = new Error('الدورة غير موجودة');
    err.status = 404;
    throw err;
  }

  return course;
}

async function assertStudentEnrollment(req, studentId, courseId) {
  await assertCourse(req, courseId);

  const enrollment = await Enrollment.findOne({
    academyId: req.academyId,
    studentId,
    courseId,
    status: { $in: ['active','paused','completed'] }
  });

  if (!enrollment) {
    const err = new Error('الطالب غير مسجل في هذه الدورة');
    err.status = 400;
    throw err;
  }

  return enrollment;
}

module.exports = {
  manageableCourseIds,
  assertCourse,
  assertStudentEnrollment
};
