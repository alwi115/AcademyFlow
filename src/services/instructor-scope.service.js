const Course = require('../models/Course');
const Group = require('../models/Group');
const Enrollment = require('../models/Enrollment');

async function instructorScope(req) {
  if (req._instructorScope) return req._instructorScope;

  const [directCourses, assignedGroups] = await Promise.all([
    Course.find({
      academyId: req.academyId,
      instructorId: req.user.sub,
      status: { $ne: 'archived' }
    }).select('_id'),
    Group.find({
      academyId: req.academyId,
      instructorId: req.user.sub,
      status: { $ne: 'cancelled' }
    }).select('_id courseId')
  ]);

  const directCourseIds = directCourses.map(row => String(row._id));
  const rawGroupCourseIds = [...new Set(
    assignedGroups.map(row => String(row.courseId || '')).filter(Boolean)
  )];

  const validGroupCourses = rawGroupCourseIds.length
    ? await Course.find({
        academyId: req.academyId,
        _id: { $in: rawGroupCourseIds },
        status: { $ne: 'archived' }
      }).select('_id')
    : [];

  const groupCourseIds = validGroupCourses.map(row => String(row._id));
  const validGroupCourseSet = new Set(groupCourseIds);

  const scopedGroups = assignedGroups.filter(
    row => validGroupCourseSet.has(String(row.courseId || ''))
  );

  const assignedGroupIds = scopedGroups.map(row => String(row._id));
  const contentCourseIds = [...new Set([
    ...directCourseIds,
    ...groupCourseIds
  ])];

  const groupIdsByCourse = new Map();

  for (const group of scopedGroups) {
    const courseId = String(group.courseId);
    if (!groupIdsByCourse.has(courseId)) groupIdsByCourse.set(courseId, []);
    groupIdsByCourse.get(courseId).push(String(group._id));
  }

  req._instructorScope = {
    directCourseIds,
    groupCourseIds,
    contentCourseIds,
    assignedGroupIds,
    groupIdsByCourse
  };

  return req._instructorScope;
}

async function manageableCourseIds(req) {
  return (await instructorScope(req)).contentCourseIds;
}

async function directlyManagedCourseIds(req) {
  return (await instructorScope(req)).directCourseIds;
}

async function assertCourse(req, courseId) {
  const scope = await instructorScope(req);

  if (!scope.contentCourseIds.includes(String(courseId))) {
    const err = new Error('لا تملك صلاحية الوصول إلى هذه الدورة');
    err.status = 403;
    throw err;
  }

  const course = await Course.findOne({
    _id: courseId,
    academyId: req.academyId,
    status: { $ne: 'archived' }
  });

  if (!course) {
    const err = new Error('الدورة غير موجودة');
    err.status = 404;
    throw err;
  }

  return course;
}

async function assertDirectCourse(req, courseId) {
  const scope = await instructorScope(req);

  if (!scope.directCourseIds.includes(String(courseId))) {
    const err = new Error('هذه العملية متاحة لمدرب الدورة الرئيسي فقط');
    err.status = 403;
    throw err;
  }

  const course = await Course.findOne({
    _id: courseId,
    academyId: req.academyId,
    instructorId: req.user.sub,
    status: { $ne: 'archived' }
  });

  if (!course) {
    const err = new Error('الدورة غير موجودة أو ليست مسندة لك مباشرة');
    err.status = 404;
    throw err;
  }

  return course;
}

function accessOr(scope) {
  const clauses = [];

  if (scope.directCourseIds.length) {
    clauses.push({ courseId: { $in: scope.directCourseIds } });
  }

  if (scope.assignedGroupIds.length) {
    clauses.push({ groupId: { $in: scope.assignedGroupIds } });
  }

  return clauses;
}

async function enrollmentAccessFilter(req, extra = {}) {
  const scope = await instructorScope(req);
  const clauses = accessOr(scope);

  if (!clauses.length) {
    return {
      academyId: req.academyId,
      _id: { $in: [] },
      ...extra
    };
  }

  return {
    academyId: req.academyId,
    ...extra,
    $or: clauses
  };
}

async function attendanceAccessFilter(req, extra = {}) {
  const scope = await instructorScope(req);
  const clauses = accessOr(scope);

  if (!clauses.length) {
    return {
      academyId: req.academyId,
      _id: { $in: [] },
      ...extra
    };
  }

  return {
    academyId: req.academyId,
    ...extra,
    $or: clauses
  };
}

async function groupAccessFilter(req, extra = {}) {
  const scope = await instructorScope(req);
  const clauses = [];

  if (scope.directCourseIds.length) {
    clauses.push({ courseId: { $in: scope.directCourseIds } });
  }

  if (scope.assignedGroupIds.length) {
    clauses.push({ _id: { $in: scope.assignedGroupIds } });
  }

  if (!clauses.length) {
    return {
      academyId: req.academyId,
      _id: { $in: [] },
      ...extra
    };
  }

  return {
    academyId: req.academyId,
    ...extra,
    $or: clauses
  };
}

async function accessibleStudentIds(req, courseId = null) {
  const extra = {
    status: { $in: ['active','paused','completed'] }
  };

  if (courseId) extra.courseId = courseId;

  const rows = await Enrollment.find(
    await enrollmentAccessFilter(req, extra)
  ).select('studentId');

  return [...new Set(
    rows.map(row => String(row.studentId || '')).filter(Boolean)
  )];
}

async function assertStudentEnrollment(req, studentId, courseId) {
  await assertCourse(req, courseId);

  const enrollment = await Enrollment.findOne(
    await enrollmentAccessFilter(req, {
      studentId,
      courseId,
      status: { $in: ['active','paused','completed'] }
    })
  );

  if (!enrollment) {
    const err = new Error('الطالب غير مسجل ضمن نطاقك في هذه الدورة');
    err.status = 403;
    throw err;
  }

  return enrollment;
}

async function assertGroupAccess(req, groupId, courseId = null) {
  const extra = { _id: groupId, status: { $ne: 'cancelled' } };
  if (courseId) extra.courseId = courseId;

  const group = await Group.findOne(
    await groupAccessFilter(req, extra)
  );

  if (!group) {
    const err = new Error('لا تملك صلاحية الوصول إلى هذه المجموعة');
    err.status = 403;
    throw err;
  }

  return group;
}

module.exports = {
  instructorScope,
  manageableCourseIds,
  directlyManagedCourseIds,
  assertCourse,
  assertDirectCourse,
  enrollmentAccessFilter,
  attendanceAccessFilter,
  groupAccessFilter,
  accessibleStudentIds,
  assertStudentEnrollment,
  assertGroupAccess
};
