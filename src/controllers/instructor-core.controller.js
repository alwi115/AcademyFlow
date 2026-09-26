const Course = require('../models/Course');
const Lesson = require('../models/Lesson');
const Group = require('../models/Group');
const Enrollment = require('../models/Enrollment');
const AssignmentSubmission = require('../models/AssignmentSubmission');
const Assessment = require('../models/Assessment');
const QuizAttempt = require('../models/QuizAttempt');
const LiveSession = require('../models/LiveSession');
const Academy = require('../models/Academy');
const { safeTimeZone, formatAcademyDisplay } = require('../services/timezone.service');
const {
  instructorScope,
  manageableCourseIds,
  enrollmentAccessFilter,
  groupAccessFilter,
  studentCourseAccessFilter
} = require('../services/instructor-scope.service');

async function options(req, res) {
  const courseIds = await manageableCourseIds(req);

  const [courses, groups, enrollments] = await Promise.all([
    Course.find({
      academyId: req.academyId,
      _id: { $in: courseIds }
    }).select('title code deliveryType status').sort({ title: 1 }),
    Group.find(
      await groupAccessFilter(req, {
        status: { $ne: 'cancelled' }
      })
    ).select('name courseId room schedule').sort({ name: 1 }),
    Enrollment.find(
      await enrollmentAccessFilter(req, {
        status: { $in: ['active','paused','completed'] }
      })
    ).populate('studentId', 'name email phone')
  ]);

  const students = new Map();

  for (const row of enrollments) {
    if (!row.studentId) continue;
    const key = String(row.studentId._id);

    if (!students.has(key)) {
      students.set(key, {
        _id: row.studentId._id,
        name: row.studentId.name,
        email: row.studentId.email,
        phone: row.studentId.phone || ''
      });
    }
  }

  res.json({ courses, groups, students: [...students.values()] });
}

async function dashboard(req, res) {
  const academyId = req.academyId;
  const courseIds = await manageableCourseIds(req);
  const academy = await Academy.findById(academyId).select('timezone');
  const timezone = safeTimeZone(academy?.timezone || 'Asia/Muscat');
  const now = new Date();

  const enrollments = await Enrollment.find(
    await enrollmentAccessFilter(req, {
      status: { $in: ['active','paused','completed'] }
    })
  ).select('studentId courseId progress');

  const studentIds = [...new Set(
    enrollments.map(row => String(row.studentId || '')).filter(Boolean)
  )];

  const [
    coursesCount,
    groupsCount,
    pendingAssignments,
    pendingQuizReviews,
    upcomingLive,
    recentSubmissions
  ] = await Promise.all([
    Course.countDocuments({ academyId, _id: { $in: courseIds } }),
    Group.countDocuments(
      await groupAccessFilter(req, {
        status: { $in: ['planned','active'] }
      })
    ),
    AssignmentSubmission.countDocuments(
      await studentCourseAccessFilter(req, {
        status: 'submitted'
      })
    ),
    QuizAttempt.countDocuments(
      await studentCourseAccessFilter(req, {
        status: 'pending_review'
      })
    ),
    LiveSession.find({
      academyId,
      instructorId: req.user.sub,
      startAt: { $gte: now },
      status: { $in: ['scheduled','live'] }
    }).populate('courseId', 'title code').sort({ startAt: 1 }).limit(5),
    AssignmentSubmission.find(
      await studentCourseAccessFilter(req)
    )
      .populate('studentId', 'name email')
      .populate('courseId', 'title')
      .populate('assessmentId', 'title totalMarks')
      .sort({ submittedAt: -1 })
      .limit(5)
  ]);

  const uniqueStudents = new Set(studentIds);

  const averageProgress = enrollments.length
    ? Math.round(
        enrollments.reduce((sum, row) => sum + Number(row.progress || 0), 0) /
        enrollments.length
      )
    : 0;

  res.json({
    courses: coursesCount,
    groups: groupsCount,
    students: uniqueStudents.size,
    averageProgress,
    pendingAssignments,
    pendingQuizReviews,
    upcomingLive: upcomingLive.map(row => ({
      id: row._id,
      title: row.title,
      course: row.courseId,
      startAt: row.startAt,
      startAtDisplay: formatAcademyDisplay(row.startAt, timezone),
      timezone,
      durationMinutes: row.durationMinutes,
      status: row.status,
      zoomReady: Boolean(row.zoomJoinUrl)
    })),
    recentSubmissions
  });
}

async function courses(req, res) {
  const academyId = req.academyId;
  const courseIds = await manageableCourseIds(req);

  const rows = await Course.find({
    academyId,
    _id: { $in: courseIds }
  }).sort({ createdAt: -1 });

  const result = await Promise.all(rows.map(async course => {
    const [lessonCount, studentRows, groupCount] = await Promise.all([
      Lesson.countDocuments({ academyId, courseId: course._id }),
      Enrollment.find(
        await enrollmentAccessFilter(req, {
          courseId: course._id,
          status: { $in: ['active','paused','completed'] }
        })
      ).select('progress'),
      Group.countDocuments(
        await groupAccessFilter(req, {
          courseId: course._id,
          status: { $ne: 'cancelled' }
        })
      )
    ]);

    const averageProgress = studentRows.length
      ? Math.round(
          studentRows.reduce((sum, row) => sum + Number(row.progress || 0), 0) /
          studentRows.length
        )
      : 0;

    return {
      ...course.toObject(),
      lessonCount,
      studentCount: studentRows.length,
      groupCount,
      averageProgress
    };
  }));

  res.json(result);
}

async function groups(req, res) {
  res.json(
    await Group.find(
      await groupAccessFilter(req)
    )
      .populate('courseId', 'title code')
      .populate('branchId', 'name code')
      .sort({ createdAt: -1 })
  );
}

async function students(req, res) {
  const rows = await Enrollment.find(
    await enrollmentAccessFilter(req, {
      status: { $in: ['active','paused','completed'] }
    })
  )
    .populate('studentId', 'name email phone lastLoginAt')
    .populate('courseId', 'title code')
    .populate('groupId', 'name')
    .sort({ updatedAt: -1 });

  res.json(rows);
}

async function gradebook(req, res) {
  const academyId = req.academyId;
  const courseIds = await manageableCourseIds(req);

  const enrollments = await Enrollment.find(
    await enrollmentAccessFilter(req, {
      status: { $in: ['active','paused','completed'] }
    })
  )
    .populate('studentId', 'name email')
    .populate('courseId', 'title code')
    .populate('groupId', 'name');

  const [quizAttempts, assignments, submissions] = await Promise.all([
    QuizAttempt.find(
      await studentCourseAccessFilter(req, {
        status: { $in: ['graded','pending_review'] }
      })
    ),
    Assessment.find({
      academyId,
      courseId: { $in: courseIds },
      type: 'assignment'
    }).select('_id courseId totalMarks'),
    AssignmentSubmission.find(
      await studentCourseAccessFilter(req, {
        status: 'graded'
      })
    ).select('studentId courseId assessmentId score')
  ]);

  const assignmentMap = new Map(
    assignments.map(row => [String(row._id), row])
  );

  const quizBest = new Map();

  for (const attempt of quizAttempts) {
    const key = `${attempt.studentId}:${attempt.courseId}:${attempt.assessmentId}`;
    const current = quizBest.get(key);

    if (!current || Number(attempt.percentage || 0) > Number(current.percentage || 0)) {
      quizBest.set(key, attempt);
    }
  }

  const result = enrollments
    .filter(row => row.studentId && row.courseId)
    .map(enrollment => {
      const prefix = `${enrollment.studentId._id}:${enrollment.courseId._id}:`;

      const quizScores = [...quizBest.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([,attempt]) => Number(attempt.percentage || 0));

      const assignmentScores = submissions
        .filter(row =>
          String(row.studentId) === String(enrollment.studentId._id) &&
          String(row.courseId) === String(enrollment.courseId._id)
        )
        .map(row => {
          const assignment = assignmentMap.get(String(row.assessmentId));
          const total = Number(assignment?.totalMarks || 0);
          return total > 0
            ? Math.round((Number(row.score || 0) / total) * 10000) / 100
            : 0;
        });

      const quizAverage = quizScores.length
        ? Math.round(quizScores.reduce((a,b) => a+b,0) / quizScores.length * 100) / 100
        : null;

      const assignmentAverage = assignmentScores.length
        ? Math.round(assignmentScores.reduce((a,b) => a+b,0) / assignmentScores.length * 100) / 100
        : null;

      const parts = [quizAverage, assignmentAverage].filter(v => v !== null);
      const academicAverage = parts.length
        ? Math.round(parts.reduce((a,b) => a+b,0) / parts.length * 100) / 100
        : null;

      return {
        enrollmentId: enrollment._id,
        student: enrollment.studentId,
        course: enrollment.courseId,
        group: enrollment.groupId,
        progress: enrollment.progress || 0,
        quizAverage,
        assignmentAverage,
        academicAverage
      };
    });

  res.json(result);
}

async function updateCourse(req, res) {
  const row = await Course.findOne({
    _id: req.params.id,
    academyId: req.academyId,
    instructorId: req.user.sub
  });

  if (!row) {
    return res.status(404).json({
      message: 'الدورة غير موجودة أو ليست مسندة لك مباشرة'
    });
  }

  for (const key of ['title','description','category']) {
    if (req.body[key] !== undefined) {
      row[key] = typeof req.body[key] === 'string'
        ? req.body[key].trim()
        : req.body[key];
    }
  }

  if (req.body.deliveryType !== undefined) {
    if (!['recorded','live','in_person','hybrid'].includes(req.body.deliveryType)) {
      return res.status(400).json({ message: 'نوع الدورة غير صحيح' });
    }
    row.deliveryType = req.body.deliveryType;
  }

  if (req.body.startAt !== undefined) row.startAt = req.body.startAt || null;
  if (req.body.endAt !== undefined) row.endAt = req.body.endAt || null;

  if (row.startAt && row.endAt && new Date(row.endAt) < new Date(row.startAt)) {
    return res.status(400).json({
      message: 'تاريخ نهاية الدورة يجب أن يكون بعد تاريخ البداية'
    });
  }

  if (req.body.status !== undefined) {
    if (!['draft','active'].includes(req.body.status)) {
      return res.status(400).json({
        message: 'المدرب يمكنه استخدام مسودة أو نشطة فقط'
      });
    }
    row.status = req.body.status;
  }

  await row.save();
  res.json(row);
}

async function updateGroup(req, res) {
  const group = await Group.findOne({
    _id: req.params.id,
    academyId: req.academyId
  });

  if (!group) {
    return res.status(404).json({ message: 'المجموعة غير موجودة' });
  }

  const course = await Course.findOne({
    _id: group.courseId,
    academyId: req.academyId
  }).select('instructorId');

  const canManage =
    String(group.instructorId || '') === String(req.user.sub) ||
    String(course?.instructorId || '') === String(req.user.sub);

  if (!canManage) {
    return res.status(403).json({ message: 'لا تملك صلاحية تعديل هذه المجموعة' });
  }

  for (const key of ['name','schedule','room']) {
    if (req.body[key] !== undefined) {
      group[key] = typeof req.body[key] === 'string'
        ? req.body[key].trim()
        : req.body[key];
    }
  }

  if (req.body.capacity !== undefined) {
    const capacity = Number(req.body.capacity);
    if (!Number.isFinite(capacity) || capacity < 1) {
      return res.status(400).json({ message: 'سعة المجموعة غير صحيحة' });
    }
    group.capacity = capacity;
  }

  if (req.body.startAt !== undefined) group.startAt = req.body.startAt || null;
  if (req.body.endAt !== undefined) group.endAt = req.body.endAt || null;

  if (group.startAt && group.endAt && new Date(group.endAt) < new Date(group.startAt)) {
    return res.status(400).json({
      message: 'تاريخ نهاية المجموعة يجب أن يكون بعد تاريخ البداية'
    });
  }

  if (req.body.status !== undefined) {
    if (!['planned','active','completed','cancelled'].includes(req.body.status)) {
      return res.status(400).json({ message: 'حالة المجموعة غير صحيحة' });
    }
    group.status = req.body.status;
  }

  await group.save();
  await group.populate([
    { path:'courseId', select:'title code' },
    { path:'branchId', select:'name code' }
  ]);

  res.json(group);
}

module.exports = {
  options,
  dashboard,
  courses,
  updateCourse,
  groups,
  updateGroup,
  students,
  gradebook
};
