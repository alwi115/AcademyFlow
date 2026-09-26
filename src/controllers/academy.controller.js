const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Academy = require('../models/Academy');
const User = require('../models/User');
const Course = require('../models/Course');
const Lesson = require('../models/Lesson');
const Branch = require('../models/Branch');
const Group = require('../models/Group');
const Enrollment = require('../models/Enrollment');
const Attendance = require('../models/Attendance');
const Assessment = require('../models/Assessment');
const Payment = require('../models/Payment');
const Certificate = require('../models/Certificate');
const Notification = require('../models/Notification');
const SupportTicket = require('../models/SupportTicket');
const LiveSession = require('../models/LiveSession');

const STAFF_ROLES = ['admin','branch_manager','accountant','reception','content_manager','support'];

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

async function assertOwned(model, id, academyId, label) {
  if (!id) return null;
  const row = await model.findOne({ _id: id, academyId });
  if (!row) {
    const err = new Error(`${label || 'Resource'} does not belong to this academy`);
    err.status = 400;
    throw err;
  }
  return row;
}

async function assertInstructor(id, academyId) {
  const row = await assertOwned(User, id, academyId, 'Instructor');
  if (row.role !== 'instructor' || !row.active) {
    const err = new Error('Selected user is not an active instructor');
    err.status = 400;
    throw err;
  }
  return row;
}

function isBranchManager(req) {
  return req.user?.role === 'branch_manager';
}

async function branchGroups(req, { includeCancelled = false } = {}) {
  if (!isBranchManager(req)) return null;

  if (!req.user.branchId) {
    const err = new Error('Branch manager is not assigned to a branch');
    err.status = 403;
    throw err;
  }

  const query = {
    academyId: req.academyId,
    branchId: req.user.branchId
  };

  if (!includeCancelled) query.status = { $ne: 'cancelled' };

  return Group.find(query).select('_id courseId instructorId');
}

async function branchGroupIds(req, options) {
  const rows = await branchGroups(req, options);
  return rows ? rows.map(row => row._id) : null;
}


async function dashboard(req, res) {
  const academyId = req.academyId;
  const objectId = new mongoose.Types.ObjectId(academyId);
  const now = new Date();
  const role = req.user.role;

  const canSeePeople = ['owner','admin','branch_manager','reception'].includes(role);
  const canSeeContent = ['owner','admin','branch_manager','reception','content_manager'].includes(role);
  const canSeeFinance = ['owner','admin','accountant'].includes(role);
  const canSeeSchedule = ['owner','admin','branch_manager','reception','content_manager'].includes(role);
  const canOpenZoom = ['owner','admin'].includes(role);

  const [
    students,
    instructors,
    courses,
    groups,
    activeEnrollments,
    upcomingLive,
    paidRows,
    upcomingSessions
  ] = await Promise.all([
    canSeePeople ? User.countDocuments({ academyId, role: 'student', active: true }) : 0,
    canSeePeople ? User.countDocuments({ academyId, role: 'instructor', active: true }) : 0,
    canSeeContent ? Course.countDocuments({ academyId, status: { $ne: 'archived' } }) : 0,
    canSeeContent ? Group.countDocuments({ academyId, status: { $in: ['planned','active'] } }) : 0,
    canSeePeople ? Enrollment.countDocuments({ academyId, status: 'active' }) : 0,
    canSeeSchedule
      ? LiveSession.countDocuments({
          academyId,
          startAt: { $gte: now },
          status: { $in: ['scheduled','live'] }
        })
      : 0,
    canSeeFinance
      ? Payment.aggregate([
          { $match: { academyId: objectId, status: 'paid' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ])
      : [],
    canSeeSchedule
      ? LiveSession.find({
          academyId,
          startAt: { $gte: now },
          status: { $in: ['scheduled','live'] }
        })
          .populate('courseId', 'title')
          .populate('instructorId', 'name')
          .sort({ startAt: 1 })
          .limit(5)
      : []
  ]);

  res.json({
    students,
    instructors,
    courses,
    groups,
    activeEnrollments,
    upcomingLive,
    revenue: canSeeFinance ? (paidRows[0]?.total || 0) : null,
    upcomingSessions: upcomingSessions.map(x => ({
      id: x._id,
      title: x.title,
      startAt: x.startAt,
      durationMinutes: x.durationMinutes,
      course: x.courseId?.title || '',
      instructor: x.instructorId?.name || '',
      zoomJoinUrl: canOpenZoom ? (x.zoomJoinUrl || '') : ''
    }))
  });
}

async function options(req, res) {
  const academyId = req.academyId;
  const role = req.user.role;

  const needsStudents = ['owner','admin','branch_manager','reception','accountant','content_manager'].includes(role);
  const needsInstructors = ['owner','admin','branch_manager','reception','content_manager'].includes(role);
  const needsCourses = ['owner','admin','branch_manager','reception','accountant','content_manager'].includes(role);
  const needsGroups = ['owner','admin','branch_manager','reception'].includes(role);
  const needsBranches = ['owner','admin','branch_manager','reception'].includes(role);

  const [students, instructors, courses, groups, branches] = await Promise.all([
    needsStudents
      ? User.find({ academyId, role: 'student', active: true }).select('name email').sort({ name: 1 })
      : [],
    needsInstructors
      ? User.find({ academyId, role: 'instructor', active: true }).select('name email').sort({ name: 1 })
      : [],
    needsCourses
      ? Course.find({ academyId, status: { $ne: 'archived' } }).select('title code').sort({ title: 1 })
      : [],
    needsGroups
      ? Group.find({ academyId, status: { $ne: 'cancelled' } }).select('name courseId').sort({ name: 1 })
      : [],
    needsBranches
      ? Branch.find({ academyId, active: true }).select('name code').sort({ name: 1 })
      : []
  ]);

  res.json({ students, instructors, courses, groups, branches });
}

async function listUsers(req, res) {
  const academyId = req.academyId;
  const kind = req.query.kind || 'student';
  const role = req.user.role;

  const allowedKinds = {
    owner: new Set(['student','instructor','staff']),
    admin: new Set(['student','instructor','staff']),
    branch_manager: new Set(['student','instructor']),
    reception: new Set(['student','instructor']),
    content_manager: new Set(['instructor'])
  };

  if (!allowedKinds[role]?.has(kind)) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  let roleFilter;
  if (kind === 'staff') roleFilter = { $in: STAFF_ROLES };
  else if (['student','instructor'].includes(kind)) roleFilter = kind;
  else return res.status(400).json({ message: 'Invalid user kind' });

  const rows = await User.find({ academyId, role: roleFilter })
    .select('name email phone role active lastLoginAt createdAt')
    .sort({ createdAt: -1 });

  res.json(rows);
}

async function createUser(req, res) {
  const academyId = req.academyId;
  const { name, email, phone, password, role, branchId } = req.body;
  const allowed = ['student','instructor',...STAFF_ROLES];

  if (!name || !email || !password || !allowed.includes(role)) {
    return res.status(400).json({ message: 'Name, email, password and a valid role are required' });
  }

  if (role === 'admin' && req.user.role !== 'owner') {
    return res.status(403).json({
      message: 'Only the academy owner can create another admin'
    });
  }

  let resolvedBranchId = null;
  if (role === 'branch_manager') {
    if (!branchId) {
      return res.status(400).json({ message: 'Branch is required for a branch manager' });
    }

    const branch = await Branch.findOne({
      _id: branchId,
      academyId,
      active: true
    }).select('_id');

    if (!branch) {
      return res.status(400).json({ message: 'Selected branch is not available in this academy' });
    }

    resolvedBranchId = branch._id;
  }

  if (String(password).length < 10) {
    return res.status(400).json({ message: 'Password must be at least 10 characters' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  if (await User.exists({ academyId, email: normalizedEmail })) {
    return res.status(409).json({ message: 'Email is already used in this academy' });
  }

  const passwordHash = await bcrypt.hash(String(password), 12);
  const row = await User.create({
    academyId,
    branchId: resolvedBranchId,
    name: clean(name),
    email: normalizedEmail,
    phone: clean(phone),
    passwordHash,
    role
  });

  res.status(201).json({
    id: row._id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    branchId: row.branchId || null,
    active: row.active
  });
}

async function updateUser(req, res) {
  const academyId = req.academyId;
  const row = await User.findOne({
    _id: req.params.id,
    academyId
  });

  if (!row) return res.status(404).json({ message: 'User not found' });
  if (row.role === 'owner') {
    return res.status(403).json({ message: 'Owner account cannot be modified here' });
  }

  if (row.role === 'admin' && req.user.role !== 'owner') {
    return res.status(403).json({ message: 'Only the owner can modify an admin account' });
  }

  const allowed = ['student','instructor',...STAFF_ROLES];
  const nextRole = req.body.role !== undefined ? String(req.body.role) : row.role;

  if (!allowed.includes(nextRole)) {
    return res.status(400).json({ message: 'Invalid role' });
  }

  if (nextRole === 'admin' && req.user.role !== 'owner') {
    return res.status(403).json({ message: 'Only the owner can grant admin access' });
  }

  let nextBranchId = null;
  if (nextRole === 'branch_manager') {
    const requestedBranchId = req.body.branchId || row.branchId;
    if (!requestedBranchId) {
      return res.status(400).json({ message: 'Branch is required for a branch manager' });
    }

    const branch = await Branch.findOne({
      _id: requestedBranchId,
      academyId,
      active: true
    }).select('_id');

    if (!branch) {
      return res.status(400).json({ message: 'Selected branch is not available in this academy' });
    }

    nextBranchId = branch._id;
  }

  if (req.body.email !== undefined) {
    const normalizedEmail = String(req.body.email || '').trim().toLowerCase();
    if (!normalizedEmail) return res.status(400).json({ message: 'Email is required' });

    const duplicate = await User.exists({
      academyId,
      email: normalizedEmail,
      _id: { $ne: row._id }
    });

    if (duplicate) return res.status(409).json({ message: 'Email is already used in this academy' });
    row.email = normalizedEmail;
  }

  if (req.body.name !== undefined) row.name = clean(req.body.name);
  if (req.body.phone !== undefined) row.phone = clean(req.body.phone);
  if (req.body.active !== undefined) row.active = Boolean(req.body.active);

  row.role = nextRole;
  row.branchId = nextBranchId;

  await row.save();

  res.json({
    id: row._id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    branchId: row.branchId || null,
    active: row.active
  });
}



async function listBranches(req, res) {
  const query = { academyId: req.academyId };
  if (isBranchManager(req)) query._id = req.user.branchId;

  res.json(await Branch.find(query).sort({ createdAt: -1 }));
}

async function createBranch(req, res) {
  const { name, code, city, address, phone, email } = req.body;
  if (!name || !code) return res.status(400).json({ message: 'Branch name and code are required' });

  const normalizedCode = String(code).trim().toUpperCase();
  if (await Branch.exists({ academyId: req.academyId, code: normalizedCode })) {
    return res.status(409).json({ message: 'Branch code is already used' });
  }

  const row = await Branch.create({
    academyId: req.academyId,
    name: clean(name),
    code: normalizedCode,
    city: clean(city),
    address: clean(address),
    phone: clean(phone),
    email: clean(email)
  });

  res.status(201).json(row);
}

async function listCourses(req, res) {
  const query = { academyId: req.academyId };

  if (isBranchManager(req)) {
    const groups = await branchGroups(req, { includeCancelled: true });
    const courseIds = [...new Set(groups.map(row => String(row.courseId)).filter(Boolean))];
    query._id = { $in: courseIds };
  }

  const rows = await Course.find(query)
    .populate('instructorId', 'name email')
    .sort({ createdAt: -1 });

  res.json(rows);
}

async function createCourse(req, res) {
  const academyId = req.academyId;
  const {
    title, code, description, category, deliveryType, instructorId,
    price, startAt, endAt, thumbnailUrl, status
  } = req.body;

  if (!title) return res.status(400).json({ message: 'Course title is required' });
  if (instructorId) await assertInstructor(instructorId, academyId);

  if (
    req.user.role === 'content_manager' &&
    price !== undefined &&
    Number(price || 0) !== 0
  ) {
    return res.status(403).json({
      message: 'إدارة المحتوى لا تملك صلاحية تحديد سعر الدورة'
    });
  }

  const normalizedCode = code ? String(code).trim().toUpperCase() : undefined;
  if (normalizedCode && await Course.exists({ academyId, code: normalizedCode })) {
    return res.status(409).json({ message: 'Course code is already used' });
  }

  const row = await Course.create({
    academyId,
    title: clean(title),
    code: normalizedCode,
    description: clean(description),
    category: clean(category),
    deliveryType: deliveryType || 'recorded',
    instructorId: instructorId || null,
    price: req.user.role === 'content_manager' ? 0 : Number(price || 0),
    startAt: startAt || null,
    endAt: endAt || null,
    thumbnailUrl: clean(thumbnailUrl),
    status: status || 'draft'
  });

  res.status(201).json(row);
}

async function listLessons(req, res) {
  const query = { academyId: req.academyId };
  if (req.query.courseId) query.courseId = req.query.courseId;

  const rows = await Lesson.find(query)
    .populate('courseId', 'title code')
    .sort({ courseId: 1, order: 1, createdAt: 1 });

  res.json(rows);
}

async function createLesson(req, res) {
  const academyId = req.academyId;
  const { courseId, title, description, order, videoUrl, durationMinutes, isPreview, status } = req.body;

  if (!courseId || !title) {
    return res.status(400).json({ message: 'Course and lesson title are required' });
  }

  await assertOwned(Course, courseId, academyId, 'Course');

  let youtubeId = '';
  if (videoUrl) {
    youtubeId = youtubeIdFromUrl(videoUrl);
    if (!youtubeId) {
      return res.status(400).json({
        message: 'Use a valid YouTube link such as youtube.com/watch?v=... or youtu.be/...'
      });
    }
  }

  const row = await Lesson.create({
    academyId,
    courseId,
    title: clean(title),
    description: clean(description),
    order: Number(order || 1),
    videoUrl: clean(videoUrl),
    youtubeId,
    durationMinutes: Number(durationMinutes || 0),
    isPreview: Boolean(isPreview),
    status: status || 'draft'
  });

  res.status(201).json(row);
}

async function listGroups(req, res) {
  const query = { academyId: req.academyId };
  if (isBranchManager(req)) query.branchId = req.user.branchId;

  const rows = await Group.find(query)
    .populate('courseId', 'title code')
    .populate('branchId', 'name code')
    .populate('instructorId', 'name')
    .sort({ createdAt: -1 });
  res.json(rows);
}

async function createGroup(req, res) {
  const academyId = req.academyId;
  const { courseId, instructorId, name, schedule, room, capacity, startAt, endAt, status } = req.body;
  let { branchId } = req.body;

  if (!courseId || !name) return res.status(400).json({ message: 'Course and group name are required' });

  await assertOwned(Course, courseId, academyId, 'Course');

  if (isBranchManager(req)) {
    if (branchId && String(branchId) !== String(req.user.branchId)) {
      return res.status(403).json({ message: 'You can only manage groups in your assigned branch' });
    }
    branchId = req.user.branchId;
  }

  if (branchId) await assertOwned(Branch, branchId, academyId, 'Branch');
  if (instructorId) await assertInstructor(instructorId, academyId);

  const row = await Group.create({
    academyId,
    courseId,
    branchId: branchId || null,
    instructorId: instructorId || null,
    name: clean(name),
    schedule: clean(schedule),
    room: clean(room),
    capacity: Number(capacity || 20),
    startAt: startAt || null,
    endAt: endAt || null,
    status: status || 'planned'
  });

  res.status(201).json(row);
}

async function listEnrollments(req, res) {
  const query = { academyId: req.academyId };

  if (isBranchManager(req)) {
    const ids = await branchGroupIds(req, { includeCancelled: true });
    query.groupId = { $in: ids };
  }

  const rows = await Enrollment.find(query)
    .populate('studentId', 'name email phone')
    .populate('courseId', 'title code')
    .populate({ path: 'groupId', match: { academyId: req.academyId }, select: 'name' })
    .sort({ createdAt: -1 });
  res.json(rows);
}

async function createEnrollment(req, res) {
  const academyId = req.academyId;
  const { studentId, courseId, status } = req.body;
  let { groupId } = req.body;

  if (!studentId || !courseId) {
    return res.status(400).json({ message: 'Student and course are required' });
  }

  const student = await assertOwned(User, studentId, academyId, 'Student');
  if (student.role !== 'student') return res.status(400).json({ message: 'Selected user is not a student' });
  await assertOwned(Course, courseId, academyId, 'Course');

  if (isBranchManager(req) && !groupId) {
    return res.status(400).json({ message: 'Branch managers must enroll students into a group in their branch' });
  }

  if (groupId) {
    const groupQuery = {
      _id: groupId,
      academyId,
      courseId,
      status: { $ne: 'cancelled' }
    };
    if (isBranchManager(req)) groupQuery.branchId = req.user.branchId;

    const group = await Group.findOne(groupQuery).select('_id');

    if (!group) {
      return res.status(isBranchManager(req) ? 403 : 400).json({
        message: 'Selected group is outside your allowed branch or course'
      });
    }
  }

  if (await Enrollment.exists({ academyId, studentId, courseId })) {
    return res.status(409).json({ message: 'Student is already enrolled in this course' });
  }

  const row = await Enrollment.create({
    academyId,
    studentId,
    courseId,
    groupId: groupId || null,
    status: status || 'active'
  });

  res.status(201).json(row);
}

async function listAttendance(req, res) {
  const query = { academyId: req.academyId };
  if (req.query.courseId) query.courseId = req.query.courseId;

  if (isBranchManager(req)) {
    const ids = await branchGroupIds(req, { includeCancelled: true });
    query.groupId = { $in: ids };
  }

  const rows = await Attendance.find(query)
    .populate('studentId', 'name')
    .populate('courseId', 'title')
    .populate({ path: 'groupId', match: { academyId: req.academyId }, select: 'name' })
    .sort({ date: -1 })
    .limit(300);

  res.json(rows);
}

async function createAttendance(req, res) {
  const academyId = req.academyId;
  const { studentId, courseId, groupId, date, status, note } = req.body;

  if (!studentId || !courseId || !date) {
    return res.status(400).json({ message: 'Student, course and date are required' });
  }

  const student = await assertOwned(User, studentId, academyId, 'Student');
  if (student.role !== 'student') {
    return res.status(400).json({ message: 'Selected user is not a student' });
  }

  await assertOwned(Course, courseId, academyId, 'Course');

  const enrollment = await Enrollment.findOne({
    academyId,
    studentId,
    courseId,
    status: { $in: ['active','paused','completed'] }
  }).select('groupId');

  if (!enrollment) {
    return res.status(400).json({
      message: 'Student is not enrolled in this course'
    });
  }

  let resolvedGroupId = enrollment.groupId || null;

  if (isBranchManager(req)) {
    if (!resolvedGroupId) {
      return res.status(403).json({ message: 'Student is not assigned to a group in your branch' });
    }

    const allowedGroup = await Group.exists({
      _id: resolvedGroupId,
      academyId,
      branchId: req.user.branchId
    });

    if (!allowedGroup) {
      return res.status(403).json({ message: 'Student is outside your assigned branch' });
    }
  }

  if (groupId) {
    const groupQuery = {
      _id: groupId,
      academyId,
      courseId,
      status: { $ne: 'cancelled' }
    };
    if (isBranchManager(req)) groupQuery.branchId = req.user.branchId;

    const group = await Group.findOne(groupQuery).select('_id');

    if (!group) {
      return res.status(isBranchManager(req) ? 403 : 400).json({
        message: 'Selected group is outside your allowed branch or course'
      });
    }

    if (
      enrollment.groupId &&
      String(enrollment.groupId) !== String(group._id)
    ) {
      return res.status(400).json({
        message: 'Student is not enrolled in the selected group'
      });
    }

    resolvedGroupId = group._id;
  }

  const row = await Attendance.create({
    academyId,
    studentId,
    courseId,
    groupId: resolvedGroupId,
    date,
    status: status || 'present',
    note: clean(note)
  });

  res.status(201).json(row);
}

async function listAssessments(req, res) {
  const type = req.query.type;
  if (!['quiz','assignment'].includes(type)) {
    return res.status(400).json({ message: 'Assessment type is required' });
  }

  const rows = await Assessment.find({ academyId: req.academyId, type })
    .populate('courseId', 'title code')
    .sort({ createdAt: -1 });

  res.json(rows);
}

async function createAssessment(req, res) {
  const academyId = req.academyId;
  const { courseId, type, title, description, dueAt, totalMarks, passingMark, durationMinutes, status } = req.body;

  if (!courseId || !title || !['quiz','assignment'].includes(type)) {
    return res.status(400).json({ message: 'Course, title and assessment type are required' });
  }

  await assertOwned(Course, courseId, academyId, 'Course');

  const row = await Assessment.create({
    academyId,
    courseId,
    type,
    title: clean(title),
    description: clean(description),
    dueAt: dueAt || null,
    totalMarks: Number(totalMarks || 100),
    passingMark: Number(passingMark || 50),
    durationMinutes: Number(durationMinutes || 0),
    status: status || 'draft'
  });

  res.status(201).json(row);
}

async function listPayments(req, res) {
  const rows = await Payment.find({ academyId: req.academyId })
    .populate('studentId', 'name email')
    .populate('courseId', 'title')
    .sort({ paidAt: -1, createdAt: -1 });
  res.json(rows);
}

async function createPayment(req, res) {
  const academyId = req.academyId;
  const { studentId, courseId, amount, method, status, reference, paidAt, notes } = req.body;

  if (!studentId || amount === undefined || Number(amount) < 0) {
    return res.status(400).json({ message: 'Student and valid amount are required' });
  }

  const student = await assertOwned(User, studentId, academyId, 'Student');
  if (student.role !== 'student') return res.status(400).json({ message: 'Selected user is not a student' });
  if (courseId) await assertOwned(Course, courseId, academyId, 'Course');

  const academy = await Academy.findById(academyId).select('currency');

  const row = await Payment.create({
    academyId,
    studentId,
    courseId: courseId || null,
    amount: Number(amount),
    currency: academy?.currency || 'OMR',
    method: method || 'cash',
    status: status || 'paid',
    reference: clean(reference),
    paidAt: paidAt || new Date(),
    notes: clean(notes)
  });

  res.status(201).json(row);
}

async function listCertificates(req, res) {
  const rows = await Certificate.find({ academyId: req.academyId })
    .populate('studentId', 'name email')
    .populate('courseId', 'title code')
    .sort({ issuedAt: -1 });
  res.json(rows);
}

async function createCertificate(req, res) {
  const academyId = req.academyId;
  const { studentId, courseId, certificateNo, issuedAt } = req.body;

  if (!studentId || !courseId) {
    return res.status(400).json({ message: 'Student and course are required' });
  }

  const student = await assertOwned(User, studentId, academyId, 'Student');
  if (student.role !== 'student') {
    return res.status(400).json({ message: 'Selected user is not a student' });
  }

  await assertOwned(Course, courseId, academyId, 'Course');

  const enrollment = await Enrollment.exists({
    academyId,
    studentId,
    courseId,
    status: { $in: ['active','paused','completed'] }
  });

  if (!enrollment) {
    return res.status(400).json({
      message: 'Student is not enrolled in this course'
    });
  }

  const generated = `CERT-${new Date().getFullYear()}-${String(Date.now()).slice(-7)}-${Math.floor(Math.random()*90+10)}`;
  const row = await Certificate.create({
    academyId,
    studentId,
    courseId,
    certificateNo: clean(certificateNo) || generated,
    issuedAt: issuedAt || new Date()
  });

  res.status(201).json(row);
}

async function listNotifications(req, res) {
  res.json(await Notification.find({ academyId: req.academyId }).sort({ createdAt: -1 }).limit(200));
}

async function createNotification(req, res) {
  const { title, message, audience, channel, status } = req.body;
  if (!title || !message) return res.status(400).json({ message: 'Title and message are required' });

  const row = await Notification.create({
    academyId: req.academyId,
    title: clean(title),
    message: clean(message),
    audience: audience || 'all',
    channel: channel || 'in_app',
    status: status || 'sent',
    sentAt: (status || 'sent') === 'sent' ? new Date() : null
  });

  res.status(201).json(row);
}

async function listSupport(req, res) {
  const query = { academyId: req.academyId };
  if (!['owner','admin','support'].includes(req.user.role)) query.createdBy = req.user.sub;

  const rows = await SupportTicket.find(query)
    .populate('createdBy', 'name email role')
    .sort({ createdAt: -1 });

  res.json(rows);
}

async function createSupport(req, res) {
  const { subject, category, priority, message } = req.body;
  if (!subject || !message) return res.status(400).json({ message: 'Subject and message are required' });

  const row = await SupportTicket.create({
    academyId: req.academyId,
    createdBy: req.user.sub,
    subject: clean(subject),
    category: category || 'technical',
    priority: priority || 'normal',
    message: clean(message)
  });

  res.status(201).json(row);
}

async function reports(req, res) {
  const academyId = req.academyId;
  const objectId = new mongoose.Types.ObjectId(academyId);

  const [
    students,
    courses,
    enrollments,
    attendanceTotal,
    attendancePresent,
    revenueRows,
    topRows
  ] = await Promise.all([
    User.countDocuments({ academyId, role: 'student', active: true }),
    Course.countDocuments({ academyId, status: { $ne: 'archived' } }),
    Enrollment.countDocuments({ academyId }),
    Attendance.countDocuments({ academyId }),
    Attendance.countDocuments({ academyId, status: { $in: ['present','late'] } }),
    Payment.aggregate([
      { $match: { academyId: objectId, status: 'paid' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]),
    Enrollment.aggregate([
      { $match: { academyId: objectId } },
      { $group: { _id: '$courseId', enrollments: { $sum: 1 } } },
      { $sort: { enrollments: -1 } },
      { $limit: 5 }
    ])
  ]);

  const ids = topRows.map(x => x._id);
  const courseRows = await Course.find({ _id: { $in: ids }, academyId }).select('title');
  const titleMap = Object.fromEntries(courseRows.map(x => [x._id.toString(), x.title]));

  res.json({
    students,
    courses,
    enrollments,
    revenue: revenueRows[0]?.total || 0,
    paidTransactions: revenueRows[0]?.count || 0,
    attendanceRate: attendanceTotal ? Math.round((attendancePresent / attendanceTotal) * 100) : 0,
    topCourses: topRows.map(x => ({
      courseId: x._id,
      title: titleMap[x._id.toString()] || 'Course',
      enrollments: x.enrollments
    }))
  });
}

async function getSettings(req, res) {
  const academy = await Academy.findById(req.academyId)
    .select('code name nameEn slug logoUrl phone email country city currency timezone branding status trialEndsAt subscriptionEndsAt');

  if (!academy) return res.status(404).json({ message: 'Academy not found' });
  res.json(academy);
}

async function updateSettings(req, res) {
  const allowed = ['name','nameEn','logoUrl','phone','email','country','city','currency','timezone'];
  const update = {};

  for (const key of allowed) {
    if (req.body[key] !== undefined) update[key] = clean(req.body[key]);
  }

  if (req.body.branding && typeof req.body.branding === 'object') {
    update.branding = {
      primaryColor: clean(req.body.branding.primaryColor) || '#0f766e',
      secondaryColor: clean(req.body.branding.secondaryColor) || '#0f172a',
      coverUrl: clean(req.body.branding.coverUrl) || ''
    };
  }

  const row = await Academy.findOneAndUpdate(
    { _id: req.academyId },
    { $set: update },
    { new: true, runValidators: true }
  );

  res.json(row);
}

module.exports = {
  dashboard,
  options,
  listUsers,
  createUser,
  listBranches,
  createBranch,
  listCourses,
  createCourse,
  listLessons,
  createLesson,
  listGroups,
  createGroup,
  listEnrollments,
  createEnrollment,
  listAttendance,
  createAttendance,
  listAssessments,
  createAssessment,
  listPayments,
  createPayment,
  listCertificates,
  createCertificate,
  listNotifications,
  createNotification,
  listSupport,
  createSupport,
  reports,
  getSettings,
  updateSettings
};
