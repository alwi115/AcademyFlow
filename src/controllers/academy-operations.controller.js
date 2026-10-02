const Course = require('../models/Course');
const Group = require('../models/Group');
const Assessment = require('../models/Assessment');
const Branch = require('../models/Branch');
const User = require('../models/User');
const AssignmentSubmission = require('../models/AssignmentSubmission');
const Academy = require('../models/Academy');
const { safeTimeZone, parseAcademyDateTime, formatAcademyInput, formatAcademyDisplay } = require('../services/timezone.service');
const { objectId } = require('../utils/security-input');

function clean(value) {
  return typeof value === 'string' ? value.trim() : value;
}

async function assertInstructor(id, academyId) {
  if (!id) return null;

  const safeId = objectId(String(id), 'معرف المدرب غير صحيح');
  const user = await User.findOne({
    _id: safeId,
    academyId,
    role: 'instructor',
    active: true
  });

  if (!user) {
    const err = new Error('المدرب المحدد غير موجود أو غير نشط');
    err.status = 400;
    throw err;
  }

  return user;
}

function validateRange(startAt, endAt, label) {
  if (!startAt || !endAt) return;

  if (new Date(endAt).getTime() < new Date(startAt).getTime()) {
    const err = new Error(`تاريخ نهاية ${label} يجب أن يكون بعد تاريخ البداية`);
    err.status = 400;
    throw err;
  }
}

async function updateCourse(req, res) {
  if (!['owner', 'admin', 'content_manager'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Course editing is not allowed for this role' });
  }
  const courseId = objectId(req.params.id, 'معرف الدورة غير صحيح');
  const row = await Course.findOne({
    _id: courseId,
    academyId: req.academyId
  });

  if (!row) {
    return res.status(404).json({ message: 'الدورة غير موجودة' });
  }

  if (req.body.code !== undefined) {
    const code = clean(req.body.code)
      ? String(req.body.code).trim().toUpperCase()
      : undefined;

    if (
      code &&
      await Course.exists({
        academyId: req.academyId,
        code,
        _id: { $ne: row._id }
      })
    ) {
      return res.status(409).json({ message: 'كود الدورة مستخدم مسبقًا' });
    }

    row.code = code;
  }

  if (req.body.instructorId !== undefined) {
    if (req.body.instructorId) {
      await assertInstructor(req.body.instructorId, req.academyId);
      row.instructorId = req.body.instructorId;
    } else {
      row.instructorId = null;
    }
  }

  const textFields = ['title','description','category','thumbnailUrl'];
  for (const key of textFields) {
    if (req.body[key] !== undefined) row[key] = clean(req.body[key]);
  }

  if (req.body.deliveryType !== undefined) {
    if (!['recorded','live','in_person','hybrid'].includes(req.body.deliveryType)) {
      return res.status(400).json({ message: 'نوع الدورة غير صحيح' });
    }
    row.deliveryType = req.body.deliveryType;
  }

  if (req.body.price !== undefined) {
    if (req.user.role === 'content_manager') {
      return res.status(403).json({
        message: 'إدارة المحتوى لا تملك صلاحية تعديل سعر الدورة'
      });
    }

    const price = Number(req.body.price);
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ message: 'سعر الدورة غير صحيح' });
    }
    row.price = price;
  }

  if (req.body.startAt !== undefined) row.startAt = req.body.startAt || null;
  if (req.body.endAt !== undefined) row.endAt = req.body.endAt || null;

  if (req.body.status !== undefined) {
    if (!['draft','active','archived'].includes(req.body.status)) {
      return res.status(400).json({ message: 'حالة الدورة غير صحيحة' });
    }
    row.status = req.body.status;
  }

  validateRange(row.startAt, row.endAt, 'الدورة');

  await row.save();
  await row.populate('instructorId', 'name email');

  res.json(row);
}

async function updateGroup(req, res) {
  const groupId = objectId(req.params.id, 'معرف المجموعة غير صحيح');
  const query = {
    _id: groupId,
    academyId: req.academyId
  };

  if (req.user.role === 'branch_manager') {
    if (!req.user.branchId) {
      return res.status(403).json({ message: 'مدير الفرع غير مرتبط بفرع' });
    }
    query.branchId = req.user.branchId;
  }

  const row = await Group.findOne(query);

  if (!row) {
    return res.status(404).json({ message: 'المجموعة غير موجودة أو خارج نطاق فرعك' });
  }

  let branchManagerScope = null;

  if (req.user.role === 'branch_manager') {
    const scopedGroups = await Group.find({
      academyId: req.academyId,
      branchId: req.user.branchId,
      status: { $ne: 'cancelled' }
    }).select('courseId instructorId');

    const allowedCourseIds = [...new Set(
      scopedGroups.map(group => String(group.courseId || '')).filter(Boolean)
    )];

    const scopedCourses = await Course.find({
      academyId: req.academyId,
      _id: { $in: allowedCourseIds }
    }).select('instructorId');

    branchManagerScope = {
      courseIds: allowedCourseIds,
      instructorIds: [...new Set([
        ...scopedGroups.map(group => String(group.instructorId || '')).filter(Boolean),
        ...scopedCourses.map(course => String(course.instructorId || '')).filter(Boolean)
      ])]
    };
  }

  if (req.body.courseId !== undefined) {
    if (
      req.user.role === 'branch_manager' &&
      String(req.body.courseId) !== String(row.courseId) &&
      !branchManagerScope.courseIds.includes(String(req.body.courseId))
    ) {
      return res.status(403).json({
        message: 'مدير الفرع لا يستطيع ربط المجموعة بدورة خارج نطاق فرعه'
      });
    }

    const requestedCourseId = objectId(String(req.body.courseId), 'معرف الدورة غير صحيح');
    const course = await Course.findOne({
      _id: requestedCourseId,
      academyId: req.academyId
    });

    if (!course) {
      return res.status(400).json({ message: 'الدورة المحددة غير موجودة' });
    }

    row.courseId = course._id;
  }

  if (req.body.branchId !== undefined) {
    if (req.user.role === 'branch_manager') {
      if (String(req.body.branchId || '') !== String(req.user.branchId || '')) {
        return res.status(403).json({
          message: 'مدير الفرع لا يستطيع نقل المجموعة إلى فرع آخر'
        });
      }
      row.branchId = req.user.branchId;
    } else if (req.body.branchId) {
      const requestedBranchId = objectId(String(req.body.branchId), 'معرف الفرع غير صحيح');
      const branch = await Branch.findOne({
        _id: requestedBranchId,
        academyId: req.academyId
      });

      if (!branch) {
        return res.status(400).json({ message: 'الفرع المحدد غير موجود' });
      }

      row.branchId = branch._id;
    } else {
      row.branchId = null;
    }
  }

  if (req.body.instructorId !== undefined) {
    if (req.body.instructorId) {
      if (
        req.user.role === 'branch_manager' &&
        String(req.body.instructorId) !== String(row.instructorId || '') &&
        !branchManagerScope.instructorIds.includes(String(req.body.instructorId))
      ) {
        return res.status(403).json({
          message: 'مدير الفرع لا يستطيع تعيين مدرب خارج نطاق فرعه'
        });
      }

      await assertInstructor(req.body.instructorId, req.academyId);
      row.instructorId = req.body.instructorId;
    } else {
      row.instructorId = null;
    }
  }

  for (const key of ['name','schedule','room']) {
    if (req.body[key] !== undefined) row[key] = clean(req.body[key]);
  }

  if (req.body.capacity !== undefined) {
    const capacity = Number(req.body.capacity);
    if (!Number.isFinite(capacity) || capacity < 1) {
      return res.status(400).json({ message: 'سعة المجموعة غير صحيحة' });
    }
    row.capacity = capacity;
  }

  if (req.body.startAt !== undefined) row.startAt = req.body.startAt || null;
  if (req.body.endAt !== undefined) row.endAt = req.body.endAt || null;

  if (req.body.status !== undefined) {
    if (!['planned','active','completed','cancelled'].includes(req.body.status)) {
      return res.status(400).json({ message: 'حالة المجموعة غير صحيحة' });
    }
    row.status = req.body.status;
  }

  validateRange(row.startAt, row.endAt, 'المجموعة');

  await row.save();
  await row.populate([
    { path:'courseId', select:'title code' },
    { path:'branchId', select:'name code' },
    { path:'instructorId', select:'name email' }
  ]);

  res.json(row);
}

async function updateAssignment(req, res) {
  const assignmentId = objectId(req.params.id, 'معرف الواجب غير صحيح');
  const row = await Assessment.findOne({
    _id: assignmentId,
    academyId: req.academyId,
    type: 'assignment'
  });

  if (!row) {
    return res.status(404).json({ message: 'الواجب غير موجود' });
  }

  const hasSubmissions = await AssignmentSubmission.exists({
    academyId: req.academyId,
    assessmentId: row._id
  });

  if (req.body.courseId !== undefined && String(req.body.courseId) !== String(row.courseId)) {
    if (hasSubmissions) {
      return res.status(409).json({
        message: 'لا يمكن تغيير الدورة بعد وجود تسليمات'
      });
    }

    const requestedCourseId = objectId(String(req.body.courseId), 'معرف الدورة غير صحيح');
    const course = await Course.findOne({
      _id: requestedCourseId,
      academyId: req.academyId
    });

    if (!course) {
      return res.status(400).json({ message: 'الدورة المحددة غير موجودة' });
    }

    row.courseId = course._id;
  }

  if (req.body.title !== undefined) row.title = clean(req.body.title);
  if (req.body.description !== undefined) row.description = clean(req.body.description);
  if (req.body.dueAt !== undefined) {
    const academy = await Academy.findById(req.academyId).select('timezone');
    const timezone = safeTimeZone(academy?.timezone || 'Asia/Muscat');
    row.dueAt = req.body.dueAt ? parseAcademyDateTime(req.body.dueAt, timezone) : null;
  }

  if (req.body.totalMarks !== undefined) {
    const total = Number(req.body.totalMarks);

    if (!Number.isFinite(total) || total < 1) {
      return res.status(400).json({ message: 'الدرجة الكاملة غير صحيحة' });
    }

    if (hasSubmissions && total !== Number(row.totalMarks)) {
      return res.status(409).json({
        message: 'لا يمكن تغيير الدرجة الكاملة بعد وجود تسليمات'
      });
    }

    row.totalMarks = total;
  }

  if (req.body.passingMark !== undefined) {
    const passing = Number(req.body.passingMark);
    if (!Number.isFinite(passing) || passing < 0) {
      return res.status(400).json({ message: 'درجة النجاح غير صحيحة' });
    }
    row.passingMark = passing;
  }

  if (req.body.status !== undefined) {
    if (!['draft','published','closed'].includes(req.body.status)) {
      return res.status(400).json({ message: 'حالة الواجب غير صحيحة' });
    }
    row.status = req.body.status;
  }

  await row.save();
  await row.populate('courseId', 'title code');

  const academy = await Academy.findById(req.academyId).select('timezone');
  const timezone = safeTimeZone(academy?.timezone || 'Asia/Muscat');
  res.json({
    ...row.toObject(),
    dueAtLocal: formatAcademyInput(row.dueAt, timezone),
    dueAtDisplay: formatAcademyDisplay(row.dueAt, timezone),
    timezone
  });
}

module.exports = {
  updateCourse,
  updateGroup,
  updateAssignment
};
