const Lesson = require('../models/Lesson');
const Attendance = require('../models/Attendance');
const Assessment = require('../models/Assessment');
const AssignmentSubmission = require('../models/AssignmentSubmission');
const Notification = require('../models/Notification');
const {
  manageableCourseIds,
  assertCourse,
  assertStudentEnrollment
} = require('../services/instructor-scope.service');

function clean(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function youtubeIdFromUrl(input) {
  if (!input) return '';
  const value = String(input).trim();

  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;

  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id || '') ? id : '';
    }

    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const direct = url.searchParams.get('v');
      if (/^[a-zA-Z0-9_-]{11}$/.test(direct || '')) return direct;

      const parts = url.pathname.split('/').filter(Boolean);
      const id = ['embed','shorts','live'].includes(parts[0]) ? parts[1] : '';
      return /^[a-zA-Z0-9_-]{11}$/.test(id || '') ? id : '';
    }
  } catch {}

  return '';
}

async function lessons(req, res) {
  const courseIds = await manageableCourseIds(req);
  const query = {
    academyId: req.academyId,
    courseId: { $in: courseIds }
  };

  if (req.query.courseId) {
    await assertCourse(req, req.query.courseId);
    query.courseId = req.query.courseId;
  }

  res.json(
    await Lesson.find(query)
      .populate('courseId', 'title code')
      .sort({ courseId: 1, order: 1, createdAt: 1 })
  );
}

async function createLesson(req, res) {
  const {
    courseId, title, description, order, videoUrl,
    durationMinutes, isPreview, status
  } = req.body;

  if (!courseId || !clean(title)) {
    return res.status(400).json({ message: 'الدورة وعنوان الدرس مطلوبان' });
  }

  await assertCourse(req, courseId);

  let youtubeId = '';
  if (videoUrl) {
    youtubeId = youtubeIdFromUrl(videoUrl);
    if (!youtubeId) {
      return res.status(400).json({ message: 'استخدم رابط YouTube صحيح' });
    }
  }

  const row = await Lesson.create({
    academyId: req.academyId,
    courseId,
    title: clean(title),
    description: clean(description),
    order: Math.max(1, Number(order || 1)),
    videoUrl: clean(videoUrl),
    youtubeId,
    durationMinutes: Math.max(0, Number(durationMinutes || 0)),
    isPreview: Boolean(isPreview),
    status: status === 'published' ? 'published' : 'draft'
  });

  res.status(201).json(row);
}

async function updateLesson(req, res) {
  const row = await Lesson.findOne({
    _id: req.params.id,
    academyId: req.academyId
  });

  if (!row) return res.status(404).json({ message: 'الدرس غير موجود' });
  await assertCourse(req, row.courseId);

  if (req.body.courseId !== undefined) {
    await assertCourse(req, req.body.courseId);
    row.courseId = req.body.courseId;
  }

  if (req.body.title !== undefined) row.title = clean(req.body.title);
  if (req.body.description !== undefined) row.description = clean(req.body.description);
  if (req.body.order !== undefined) row.order = Math.max(1, Number(req.body.order || 1));
  if (req.body.durationMinutes !== undefined) {
    row.durationMinutes = Math.max(0, Number(req.body.durationMinutes || 0));
  }
  if (req.body.isPreview !== undefined) row.isPreview = Boolean(req.body.isPreview);
  if (req.body.status !== undefined) {
    row.status = req.body.status === 'published' ? 'published' : 'draft';
  }

  if (req.body.videoUrl !== undefined) {
    const value = clean(req.body.videoUrl) || '';
    if (value) {
      const id = youtubeIdFromUrl(value);
      if (!id) return res.status(400).json({ message: 'استخدم رابط YouTube صحيح' });
      row.videoUrl = value;
      row.youtubeId = id;
    } else {
      row.videoUrl = '';
      row.youtubeId = '';
    }
  }

  await row.save();
  res.json(row);
}

async function attendance(req, res) {
  const courseIds = await manageableCourseIds(req);
  const query = {
    academyId: req.academyId,
    courseId: { $in: courseIds }
  };

  if (req.query.courseId) {
    await assertCourse(req, req.query.courseId);
    query.courseId = req.query.courseId;
  }

  const rows = await Attendance.find(query)
    .populate('studentId', 'name email')
    .populate('courseId', 'title code')
    .populate('groupId', 'name')
    .sort({ date: -1 })
    .limit(500);

  res.json(rows);
}

async function createAttendance(req, res) {
  const { studentId, courseId, groupId, date, status, note } = req.body;

  if (!studentId || !courseId || !date) {
    return res.status(400).json({ message: 'الطالب والدورة والتاريخ مطلوبة' });
  }

  const enrollment = await assertStudentEnrollment(req, studentId, courseId);

  const row = await Attendance.create({
    academyId: req.academyId,
    studentId,
    courseId,
    groupId: groupId || enrollment.groupId || null,
    date,
    status: ['present','absent','late','excused'].includes(status)
      ? status
      : 'present',
    note: clean(note)
  });

  res.status(201).json(row);
}

async function assignments(req, res) {
  const courseIds = await manageableCourseIds(req);

  const rows = await Assessment.find({
    academyId: req.academyId,
    courseId: { $in: courseIds },
    type: 'assignment'
  })
    .populate('courseId', 'title code')
    .sort({ createdAt: -1 });

  const result = await Promise.all(rows.map(async assignment => {
    const [submissionCount, pendingCount, gradedCount] = await Promise.all([
      AssignmentSubmission.countDocuments({
        academyId: req.academyId,
        assessmentId: assignment._id
      }),
      AssignmentSubmission.countDocuments({
        academyId: req.academyId,
        assessmentId: assignment._id,
        status: 'submitted'
      }),
      AssignmentSubmission.countDocuments({
        academyId: req.academyId,
        assessmentId: assignment._id,
        status: 'graded'
      })
    ]);

    return {
      ...assignment.toObject(),
      submissionCount,
      pendingCount,
      gradedCount
    };
  }));

  res.json(result);
}

async function createAssignment(req, res) {
  const {
    courseId, title, description, dueAt,
    totalMarks, passingMark, status
  } = req.body;

  if (!courseId || !clean(title)) {
    return res.status(400).json({ message: 'الدورة وعنوان الواجب مطلوبان' });
  }

  await assertCourse(req, courseId);

  const row = await Assessment.create({
    academyId: req.academyId,
    courseId,
    type: 'assignment',
    title: clean(title),
    description: clean(description),
    dueAt: dueAt || null,
    totalMarks: Math.max(1, Number(totalMarks || 100)),
    passingMark: Math.max(0, Number(passingMark || 50)),
    status: ['draft','published','closed'].includes(status)
      ? status
      : 'draft'
  });

  res.status(201).json(row);
}

async function updateAssignment(req, res) {
  const row = await Assessment.findOne({
    _id: req.params.id,
    academyId: req.academyId,
    type: 'assignment'
  });

  if (!row) return res.status(404).json({ message: 'الواجب غير موجود' });
  await assertCourse(req, row.courseId);

  const hasSubmissions = await AssignmentSubmission.exists({
    academyId: req.academyId,
    assessmentId: row._id
  });

  if (req.body.courseId !== undefined && String(req.body.courseId) !== String(row.courseId)) {
    if (hasSubmissions) {
      return res.status(409).json({ message: 'لا يمكن تغيير الدورة بعد وجود تسليمات' });
    }
    await assertCourse(req, req.body.courseId);
    row.courseId = req.body.courseId;
  }

  if (req.body.title !== undefined) row.title = clean(req.body.title);
  if (req.body.description !== undefined) row.description = clean(req.body.description);
  if (req.body.dueAt !== undefined) row.dueAt = req.body.dueAt || null;

  if (req.body.totalMarks !== undefined) {
    const next = Math.max(1, Number(req.body.totalMarks || 1));
    if (hasSubmissions && next !== Number(row.totalMarks)) {
      return res.status(409).json({ message: 'لا يمكن تغيير الدرجة الكلية بعد وجود تسليمات' });
    }
    row.totalMarks = next;
  }

  if (req.body.passingMark !== undefined) {
    row.passingMark = Math.max(0, Number(req.body.passingMark || 0));
  }

  if (req.body.status !== undefined) {
    if (!['draft','published','closed'].includes(req.body.status)) {
      return res.status(400).json({ message: 'حالة الواجب غير صحيحة' });
    }
    row.status = req.body.status;
  }

  await row.save();
  res.json(row);
}

async function assignmentSubmissions(req, res) {
  const assignment = await Assessment.findOne({
    _id: req.params.id,
    academyId: req.academyId,
    type: 'assignment'
  });

  if (!assignment) return res.status(404).json({ message: 'الواجب غير موجود' });
  await assertCourse(req, assignment.courseId);

  const rows = await AssignmentSubmission.find({
    academyId: req.academyId,
    assessmentId: assignment._id
  })
    .populate('studentId', 'name email')
    .sort({ submittedAt: -1 });

  res.json({ assignment, rows });
}

async function gradeAssignment(req, res) {
  const submission = await AssignmentSubmission.findOne({
    _id: req.params.submissionId,
    academyId: req.academyId,
    assessmentId: req.params.id
  });

  if (!submission) {
    return res.status(404).json({ message: 'التسليم غير موجود' });
  }

  const assignment = await Assessment.findOne({
    _id: submission.assessmentId,
    academyId: req.academyId,
    type: 'assignment'
  });

  if (!assignment) return res.status(404).json({ message: 'الواجب غير موجود' });
  await assertCourse(req, assignment.courseId);

  const score = Number(req.body.score);

  if (!Number.isFinite(score) || score < 0 || score > Number(assignment.totalMarks)) {
    return res.status(400).json({
      message: `الدرجة يجب أن تكون بين 0 و ${assignment.totalMarks}`
    });
  }

  submission.score = score;
  submission.feedback = clean(req.body.feedback) || '';
  submission.status = 'graded';
  submission.gradedAt = new Date();

  await submission.save();
  res.json(submission);
}

async function notifications(req, res) {
  const courseIds = await manageableCourseIds(req);

  const rows = await Notification.find({
    academyId: req.academyId,
    $or: [
      { createdBy: req.user.sub },
      { courseId: { $in: courseIds } }
    ]
  })
    .populate('courseId', 'title code')
    .sort({ createdAt: -1 })
    .limit(200);

  res.json(rows);
}

async function createNotification(req, res) {
  const { courseId, title, message } = req.body;

  if (!courseId || !clean(title) || !clean(message)) {
    return res.status(400).json({ message: 'الدورة والعنوان والرسالة مطلوبة' });
  }

  await assertCourse(req, courseId);

  const row = await Notification.create({
    academyId: req.academyId,
    courseId,
    createdBy: req.user.sub,
    title: clean(title),
    message: clean(message),
    audience: 'students',
    channel: 'in_app',
    status: 'sent',
    sentAt: new Date()
  });

  res.status(201).json(row);
}

module.exports = {
  lessons,
  createLesson,
  updateLesson,
  attendance,
  createAttendance,
  assignments,
  createAssignment,
  updateAssignment,
  assignmentSubmissions,
  gradeAssignment,
  notifications,
  createNotification
};
