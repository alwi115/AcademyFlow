const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Academy = require('../models/Academy');
const Course = require('../models/Course');
const Lesson = require('../models/Lesson');
const Enrollment = require('../models/Enrollment');
const LessonProgress = require('../models/LessonProgress');
const LiveSession = require('../models/LiveSession');
const Assessment = require('../models/Assessment');
const AssignmentSubmission = require('../models/AssignmentSubmission');
const Payment = require('../models/Payment');
const Certificate = require('../models/Certificate');
const Notification = require('../models/Notification');

function clean(value) {
  return typeof value === 'string' ? value.trim() : value;
}

async function studentEnrollment(academyId, studentId, courseId) {
  return Enrollment.findOne({
    academyId,
    studentId,
    courseId,
    status: { $in: ['active','paused','completed'] }
  });
}

async function enrolledCourseIds(academyId, studentId) {
  const rows = await Enrollment.find({
    academyId,
    studentId,
    status: { $in: ['active','paused','completed'] }
  }).select('courseId');

  return rows.map(row => row.courseId);
}

async function recalcProgress(academyId, studentId, courseId) {
  const [totalLessons, completedLessons] = await Promise.all([
    Lesson.countDocuments({ academyId, courseId, status: 'published' }),
    LessonProgress.countDocuments({
      academyId,
      studentId,
      courseId,
      completed: true
    })
  ]);

  const progress = totalLessons
    ? Math.min(100, Math.round((completedLessons / totalLessons) * 100))
    : 0;

  await Enrollment.updateOne(
    {
      academyId,
      studentId,
      courseId,
      status: { $in: ['active','paused','completed'] }
    },
    { $set: { progress } }
  );

  return { progress, totalLessons, completedLessons };
}

async function dashboard(req, res) {
  const academyId = req.academyId;
  const studentId = req.user.sub;
  const now = new Date();

  const enrollments = await Enrollment.find({
    academyId,
    studentId,
    status: { $in: ['active','paused','completed'] }
  })
    .populate({
      path: 'courseId',
      select: 'title code description category deliveryType instructorId thumbnailUrl startAt endAt status',
      populate: { path: 'instructorId', select: 'name' }
    })
    .populate('groupId', 'name schedule')
    .sort({ updatedAt: -1 });

  const courseIds = enrollments
    .filter(x => x.courseId)
    .map(x => x.courseId._id);

  const [upcomingLive, publishedAssignments, issuedCertificates, unreadNotifications] = await Promise.all([
    LiveSession.find({
      academyId,
      courseId: { $in: courseIds },
      startAt: { $gte: now },
      status: { $in: ['scheduled','live'] }
    })
      .populate('courseId', 'title')
      .populate('instructorId', 'name')
      .sort({ startAt: 1 })
      .limit(5),
    Assessment.find({
      academyId,
      courseId: { $in: courseIds },
      type: 'assignment',
      status: 'published',
      $or: [{ dueAt: null }, { dueAt: { $gte: now } }]
    }).select('_id'),
    Certificate.countDocuments({
      academyId,
      studentId,
      status: 'issued'
    }),
    Notification.countDocuments({
      academyId,
      audience: { $in: ['all','students'] },
      status: 'sent',
      channel: 'in_app'
    })
  ]);

  const submittedAssignmentIds = publishedAssignments.length
    ? await AssignmentSubmission.distinct('assessmentId', {
        academyId,
        studentId,
        assessmentId: { $in: publishedAssignments.map(row => row._id) }
      })
    : [];

  const submittedSet = new Set(submittedAssignmentIds.map(String));
  const pendingAssignments = publishedAssignments.filter(
    row => !submittedSet.has(String(row._id))
  ).length;

  const averageProgress = enrollments.length
    ? Math.round(enrollments.reduce((sum, row) => sum + Number(row.progress || 0), 0) / enrollments.length)
    : 0;

  res.json({
    enrollments: enrollments.length,
    averageProgress,
    upcomingLiveCount: upcomingLive.length,
    pendingAssignments,
    certificates: issuedCertificates,
    notifications: unreadNotifications,
    recentCourses: enrollments.slice(0, 4).map(row => ({
      enrollmentId: row._id,
      status: row.status,
      progress: row.progress || 0,
      group: row.groupId?.name || '',
      course: row.courseId ? {
        id: row.courseId._id,
        title: row.courseId.title,
        code: row.courseId.code,
        description: row.courseId.description,
        category: row.courseId.category,
        deliveryType: row.courseId.deliveryType,
        thumbnailUrl: row.courseId.thumbnailUrl,
        instructor: row.courseId.instructorId?.name || ''
      } : null
    })).filter(x => x.course),
    upcomingLive: upcomingLive.map(row => ({
      id: row._id,
      title: row.title,
      course: row.courseId?.title || '',
      instructor: row.instructorId?.name || '',
      startAt: row.startAt,
      durationMinutes: row.durationMinutes,
      status: row.status,
      zoomJoinUrl: row.zoomJoinUrl || ''
    }))
  });
}

async function courses(req, res) {
  const academyId = req.academyId;
  const studentId = req.user.sub;

  const rows = await Enrollment.find({
    academyId,
    studentId,
    status: { $in: ['active','paused','completed'] }
  })
    .populate({
      path: 'courseId',
      match: { status: { $ne: 'archived' } },
      select: 'title code description category deliveryType instructorId thumbnailUrl startAt endAt status',
      populate: { path: 'instructorId', select: 'name email' }
    })
    .populate('groupId', 'name schedule room')
    .sort({ enrolledAt: -1 });

  res.json(rows.filter(row => row.courseId).map(row => ({
    enrollmentId: row._id,
    enrollmentStatus: row.status,
    progress: row.progress || 0,
    enrolledAt: row.enrolledAt,
    group: row.groupId,
    course: row.courseId
  })));
}

async function courseDetails(req, res) {
  const academyId = req.academyId;
  const studentId = req.user.sub;
  const courseId = req.params.id;

  const enrollment = await studentEnrollment(academyId, studentId, courseId);
  if (!enrollment) {
    return res.status(404).json({ message: 'Course is not available for this student' });
  }

  const course = await Course.findOne({
    _id: courseId,
    academyId,
    status: { $ne: 'archived' }
  })
    .populate('instructorId', 'name email');

  if (!course) {
    return res.status(404).json({ message: 'Course not found' });
  }

  const [lessons, progressRows] = await Promise.all([
    Lesson.find({
      academyId,
      courseId,
      status: 'published'
    }).sort({ order: 1, createdAt: 1 }),
    LessonProgress.find({
      academyId,
      studentId,
      courseId,
      completed: true
    }).select('lessonId completedAt lastOpenedAt')
  ]);

  const completedMap = new Map(
    progressRows.map(row => [String(row.lessonId), row])
  );

  const progressInfo = await recalcProgress(academyId, studentId, courseId);

  res.json({
    course,
    enrollment: {
      id: enrollment._id,
      status: enrollment.status,
      enrolledAt: enrollment.enrolledAt,
      progress: progressInfo.progress
    },
    lessons: lessons.map(row => ({
      id: row._id,
      title: row.title,
      description: row.description,
      order: row.order,
      youtubeId: row.youtubeId,
      durationMinutes: row.durationMinutes,
      completed: completedMap.has(String(row._id)),
      completedAt: completedMap.get(String(row._id))?.completedAt || null
    })),
    progress: progressInfo
  });
}

async function setLessonProgress(req, res) {
  const academyId = req.academyId;
  const studentId = req.user.sub;
  const lessonId = req.params.lessonId;
  const completed = req.body.completed !== false;

  const lesson = await Lesson.findOne({
    _id: lessonId,
    academyId,
    status: 'published'
  });

  if (!lesson) {
    return res.status(404).json({ message: 'Lesson not found' });
  }

  const enrollment = await studentEnrollment(academyId, studentId, lesson.courseId);
  if (!enrollment) {
    return res.status(403).json({ message: 'You are not enrolled in this course' });
  }

  if (completed) {
    await LessonProgress.findOneAndUpdate(
      { academyId, studentId, lessonId },
      {
        $set: {
          courseId: lesson.courseId,
          completed: true,
          completedAt: new Date(),
          lastOpenedAt: new Date()
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } else {
    await LessonProgress.deleteOne({ academyId, studentId, lessonId });
  }

  const progress = await recalcProgress(academyId, studentId, lesson.courseId);
  res.json(progress);
}

async function liveSessions(req, res) {
  const academyId = req.academyId;
  const studentId = req.user.sub;
  const courseIds = await enrolledCourseIds(academyId, studentId);

  const rows = await LiveSession.find({
    academyId,
    courseId: { $in: courseIds },
    status: { $in: ['scheduled','live','ended'] }
  })
    .populate('courseId', 'title code')
    .populate('instructorId', 'name')
    .sort({ startAt: 1 });

  res.json(rows.map(row => ({
    id: row._id,
    title: row.title,
    description: row.description,
    course: row.courseId,
    instructor: row.instructorId,
    startAt: row.startAt,
    durationMinutes: row.durationMinutes,
    status: row.status,
    zoomMeetingId: row.zoomMeetingId || '',
    zoomJoinUrl: row.zoomJoinUrl || ''
  })));
}

async function assessments(req, res) {
  const academyId = req.academyId;
  const studentId = req.user.sub;
  const type = req.query.type;

  if (!['quiz','assignment'].includes(type)) {
    return res.status(400).json({ message: 'Assessment type is required' });
  }

  const courseIds = await enrolledCourseIds(academyId, studentId);

  const rows = await Assessment.find({
    academyId,
    courseId: { $in: courseIds },
    type,
    status: { $in: ['published','closed'] }
  })
    .populate('courseId', 'title code')
    .sort({ dueAt: 1, createdAt: -1 });

  let submissionMap = new Map();

  if (type === 'assignment') {
    const submissions = await AssignmentSubmission.find({
      academyId,
      studentId,
      assessmentId: { $in: rows.map(row => row._id) }
    });

    submissionMap = new Map(
      submissions.map(row => [String(row.assessmentId), row])
    );
  }

  res.json(rows.map(row => {
    const submission = submissionMap.get(String(row._id));

    return {
      id: row._id,
      type: row.type,
      title: row.title,
      description: row.description,
      dueAt: row.dueAt,
      totalMarks: row.totalMarks,
      passingMark: row.passingMark,
      durationMinutes: row.durationMinutes,
      status: row.status,
      course: row.courseId,
      submission: submission ? {
        id: submission._id,
        answerText: submission.answerText,
        attachmentUrl: submission.attachmentUrl,
        status: submission.status,
        score: submission.score,
        feedback: submission.feedback,
        submittedAt: submission.submittedAt,
        gradedAt: submission.gradedAt
      } : null
    };
  }));
}

async function submitAssignment(req, res) {
  const academyId = req.academyId;
  const studentId = req.user.sub;
  const assessmentId = req.params.id;
  const answerText = clean(req.body.answerText) || '';
  const attachmentUrl = clean(req.body.attachmentUrl) || '';

  if (!answerText && !attachmentUrl) {
    return res.status(400).json({ message: 'Write an answer or add an attachment link' });
  }

  const assessment = await Assessment.findOne({
    _id: assessmentId,
    academyId,
    type: 'assignment',
    status: 'published'
  });

  if (!assessment) {
    return res.status(404).json({ message: 'Assignment is not available for submission' });
  }

  const enrollment = await studentEnrollment(
    academyId,
    studentId,
    assessment.courseId
  );

  if (!enrollment) {
    return res.status(403).json({ message: 'You are not enrolled in this course' });
  }

  const submission = await AssignmentSubmission.findOneAndUpdate(
    { academyId, studentId, assessmentId },
    {
      $set: {
        courseId: assessment.courseId,
        answerText,
        attachmentUrl,
        status: 'submitted',
        score: null,
        feedback: '',
        submittedAt: new Date(),
        gradedAt: null
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(201).json(submission);
}

async function payments(req, res) {
  const rows = await Payment.find({
    academyId: req.academyId,
    studentId: req.user.sub
  })
    .populate('courseId', 'title code')
    .sort({ paidAt: -1, createdAt: -1 });

  const summary = rows.reduce((acc, row) => {
    if (row.status === 'paid') acc.paid += Number(row.amount || 0);
    if (row.status === 'pending') acc.pending += Number(row.amount || 0);
    if (row.status === 'refunded') acc.refunded += Number(row.amount || 0);
    return acc;
  }, { paid: 0, pending: 0, refunded: 0 });

  res.json({ summary, rows });
}

async function certificates(req, res) {
  const rows = await Certificate.find({
    academyId: req.academyId,
    studentId: req.user.sub,
    status: 'issued'
  })
    .populate('courseId', 'title code')
    .sort({ issuedAt: -1 });

  res.json(rows);
}

async function notifications(req, res) {
  const rows = await Notification.find({
    academyId: req.academyId,
    audience: { $in: ['all','students'] },
    status: 'sent',
    channel: 'in_app'
  })
    .sort({ sentAt: -1, createdAt: -1 })
    .limit(200);

  res.json(rows);
}

async function profile(req, res) {
  const [user, academy] = await Promise.all([
    User.findOne({
      _id: req.user.sub,
      academyId: req.academyId,
      role: 'student'
    }).select('name email phone role active lastLoginAt createdAt'),
    Academy.findById(req.academyId)
      .select('code name nameEn logoUrl phone email country city currency timezone branding')
  ]);

  if (!user) {
    return res.status(404).json({ message: 'Student account not found' });
  }

  res.json({ user, academy });
}

async function updateProfile(req, res) {
  const update = {};
  if (req.body.name !== undefined) update.name = clean(req.body.name);
  if (req.body.phone !== undefined) update.phone = clean(req.body.phone);

  if (!update.name) {
    delete update.name;
  }

  const user = await User.findOneAndUpdate(
    {
      _id: req.user.sub,
      academyId: req.academyId,
      role: 'student'
    },
    { $set: update },
    { new: true, runValidators: true }
  ).select('name email phone role active lastLoginAt createdAt');

  if (!user) {
    return res.status(404).json({ message: 'Student account not found' });
  }

  res.json(user);
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current and new passwords are required' });
  }

  if (String(newPassword).length < 10) {
    return res.status(400).json({ message: 'New password must be at least 10 characters' });
  }

  const user = await User.findOne({
    _id: req.user.sub,
    academyId: req.academyId,
    role: 'student',
    active: true
  }).select('+passwordHash');

  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return res.status(400).json({ message: 'Current password is incorrect' });
  }

  user.passwordHash = await bcrypt.hash(String(newPassword), 12);
  await user.save();

  res.json({ ok: true });
}

module.exports = {
  dashboard,
  courses,
  courseDetails,
  setLessonProgress,
  liveSessions,
  assessments,
  submitAssignment,
  payments,
  certificates,
  notifications,
  profile,
  updateProfile,
  changePassword
};
