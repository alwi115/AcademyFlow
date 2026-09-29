const crypto = require('crypto');
const Certificate = require('../models/Certificate');
const User = require('../models/User');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const Notification = require('../models/Notification');
const storage = require('../services/certificate-storage.service');
const { objectId } = require('../utils/security-input');

function clean(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function requestPdfBuffer(req) {
  if (!Buffer.isBuffer(req.body)) {
    const err = new Error('اختر ملف PDF صالحًا للشهادة');
    err.status = 415;
    throw err;
  }

  return Buffer.from(req.body);
}

function generatedCertificateNo() {
  return 'CERT-' + new Date().getFullYear() + '-' +
    crypto.randomBytes(5).toString('hex').toUpperCase();
}

function safePdfName(value, fallback) {
  let name = String(value || '').trim()
    .replace(/[\\/\0\r\n]/g, '-')
    .replace(/[^\p{L}\p{N} ._()-]/gu, '')
    .slice(0, 120);

  if (!name) name = fallback || 'certificate.pdf';
  if (!/\.pdf$/i.test(name)) name += '.pdf';
  return name;
}

function publicRow(row) {
  const obj = row.toObject ? row.toObject() : { ...row };
  delete obj.fileStorageKey;
  obj.hasPdf = Boolean(obj.fileName && obj.fileSize);
  obj.downloadUrl = obj.hasPdf ? '/api/academy/certificates/' + obj._id + '/file' : '';
  return obj;
}

async function validateOwnership({ academyId, studentId, courseId }) {
  if (!studentId || !courseId) {
    const err = new Error('اختر الطالب والدورة');
    err.status = 400;
    throw err;
  }

  const requestedStudentId = String(studentId).trim();
  const requestedCourseId = String(courseId).trim();

  const [students, courses] = await Promise.all([
    User.find({
      academyId,
      role: 'student',
      active: true
    }).select('_id name email').lean(),
    Course.find({ academyId }).select('_id title code').lean()
  ]);

  const student = students.find(row => String(row._id) === requestedStudentId) || null;
  const course = courses.find(row => String(row._id) === requestedCourseId) || null;

  if (!student) {
    const err = new Error('الطالب غير موجود في هذه الأكاديمية أو غير نشط');
    err.status = 400;
    throw err;
  }

  if (!course) {
    const err = new Error('الدورة غير موجودة في هذه الأكاديمية');
    err.status = 400;
    throw err;
  }

  const enrolled = await Enrollment.exists({
    academyId,
    studentId: student._id,
    courseId: course._id,
    status: { $in: ['active','paused','completed'] }
  });

  if (!enrolled) {
    const err = new Error('لا يمكن إصدار شهادة: الطالب غير مسجل في هذه الدورة');
    err.status = 400;
    throw err;
  }

  return { student, course };
}

async function notifyStudent({ academyId, studentId, courseId, certificateNo, replaced = false }) {
  try {
    await Notification.create({
      academyId,
      courseId,
      recipientId: studentId,
      createdBy: null,
      type: 'general',
      title: replaced ? 'تم تحديث شهادتك' : 'شهادة جديدة جاهزة',
      message: replaced
        ? 'تم تحديث ملف شهادتك. يمكنك فتح النسخة الجديدة وحفظها من صفحة الشهادات.'
        : 'تم إصدار شهادة جديدة لك برقم ' + certificateNo + '. يمكنك فتحها وحفظها من صفحة الشهادات.',
      audience: 'students',
      channel: 'in_app',
      status: 'sent',
      sentAt: new Date()
    });
  } catch (err) {
    console.warn('[certificate notification]', err.message);
  }
}

async function listAcademy(req, res) {
  const rows = await Certificate.find({ academyId: req.academyId })
    .populate('studentId', 'name email')
    .populate('courseId', 'title code')
    .sort({ issuedAt: -1, createdAt: -1 });

  res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });
  res.json(rows.map(publicRow));
}

async function upload(req, res) {
  const pdf = requestPdfBuffer(req);
  storage.assertPdf(pdf);

  const academyId = String(req.academyId);
  const studentId = clean(req.query.studentId);
  const courseId = clean(req.query.courseId);
  const certificateNo = clean(req.query.certificateNo) || generatedCertificateNo();
  const issuedAt = clean(req.query.issuedAt) || new Date();
  const originalName = safePdfName(req.query.fileName, certificateNo + '.pdf');

  const { student, course } = await validateOwnership({
    academyId,
    studentId,
    courseId
  });

  let row;
  try {
    row = await Certificate.create({
      academyId,
      studentId,
      courseId,
      certificateNo,
      issuedAt,
      status: 'issued'
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: 'رقم الشهادة مستخدم مسبقًا في هذه الأكاديمية' });
    }
    throw err;
  }

  let key = '';
  try {
    key = await storage.savePdf({
      buffer: pdf
    });

    const now = new Date();
    row.fileStorageKey = key;
    row.fileName = originalName;
    row.fileMimeType = 'application/pdf';
    row.fileSize = pdf.length;
    row.fileUploadedAt = now;
    row.fileUploadedBy = req.user.sub;
    row.deliveredAt = now;
    await row.save();

    await notifyStudent({
      academyId,
      studentId: student._id,
      courseId: course._id,
      certificateNo
    });

    await row.populate([
      { path:'studentId', select:'name email' },
      { path:'courseId', select:'title code' }
    ]);

    res.status(201).json(publicRow(row));
  } catch (err) {
    if (key) await storage.remove(key).catch(() => {});
    await Certificate.deleteOne({ _id: row._id, academyId }).catch(() => {});
    throw err;
  }
}

async function replaceFile(req, res) {
  const pdf = requestPdfBuffer(req);
  storage.assertPdf(pdf);
  const certificateId = objectId(req.params.id, 'معرف الشهادة غير صحيح');

  const row = await Certificate.findOne({
    _id: certificateId,
    academyId: req.academyId
  }).select('+fileStorageKey');

  if (!row) return res.status(404).json({ message: 'الشهادة غير موجودة' });

  const oldKey = row.fileStorageKey || '';
  const newKey = await storage.savePdf({
    buffer: pdf
  });

  const now = new Date();
  row.fileStorageKey = newKey;
  row.fileName = safePdfName(req.query.fileName, row.certificateNo + '.pdf');
  row.fileMimeType = 'application/pdf';
  row.fileSize = pdf.length;
  row.fileUploadedAt = now;
  row.fileUploadedBy = req.user.sub;
  row.deliveredAt = now;
  row.status = 'issued';

  try {
    await row.save();
  } catch (err) {
    await storage.remove(newKey).catch(() => {});
    throw err;
  }

  if (oldKey && oldKey !== newKey) {
    await storage.remove(oldKey).catch(err => {
      console.warn('[certificate old file cleanup]', err.message);
    });
  }

  await notifyStudent({
    academyId: req.academyId,
    studentId: row.studentId,
    courseId: row.courseId,
    certificateNo: row.certificateNo,
    replaced: true
  });

  await row.populate([
    { path:'studentId', select:'name email' },
    { path:'courseId', select:'title code' }
  ]);

  res.json(publicRow(row));
}

async function setStatus(req, res) {
  const status = String(req.body.status || '');
  if (!['issued','revoked'].includes(status)) {
    return res.status(400).json({ message: 'حالة الشهادة غير صحيحة' });
  }

  const row = await Certificate.findOneAndUpdate(
    { _id: req.params.id, academyId: req.academyId },
    { $set: { status } },
    { new: true, runValidators: true }
  )
    .populate('studentId', 'name email')
    .populate('courseId', 'title code');

  if (!row) return res.status(404).json({ message: 'الشهادة غير موجودة' });
  res.json(publicRow(row));
}

function sendPdf(res, row, buffer, download) {
  const fallback = row.certificateNo ? row.certificateNo + '.pdf' : 'certificate.pdf';
  const filename = safePdfName(row.fileName, fallback);
  const disposition = download ? 'attachment' : 'inline';
  const encoded = encodeURIComponent(filename).replace(/['()]/g, escape);

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': disposition + '; filename="certificate.pdf"; filename*=UTF-8\'\'' + encoded,
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': String(buffer.length)
  });

  return res.end(buffer);
}

async function academyFile(req, res) {
  const row = await Certificate.findOne({
    _id: req.params.id,
    academyId: req.academyId
  }).select('+fileStorageKey');

  if (!row) return res.status(404).json({ message: 'الشهادة غير موجودة' });
  if (!row.fileStorageKey) return res.status(404).json({ message: 'لا يوجد ملف PDF لهذه الشهادة' });

  let pdf;
  try {
    pdf = await storage.read(row.fileStorageKey);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ message: 'ملف الشهادة غير موجود في MongoDB' });
    }
    if (err.code === 'LEGACY_STORAGE_KEY') {
      return res.status(409).json({
        message: 'ملف الشهادة قديم ويحتاج ترحيل إلى MongoDB قبل تنزيله'
      });
    }
    throw err;
  }

  return sendPdf(
    res,
    row,
    pdf,
    req.query.download === '1'
  );
}

async function listStudent(req, res) {
  const rows = await Certificate.find({
    academyId: req.academyId,
    studentId: req.user.sub,
    status: 'issued'
  })
    .populate('courseId', 'title code')
    .sort({ issuedAt: -1, createdAt: -1 });

  res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });
  res.json(rows.map(row => {
    const obj = publicRow(row);
    obj.downloadUrl = obj.hasPdf ? '/api/student/certificates/' + obj._id + '/file' : '';
    return obj;
  }));
}

async function studentFile(req, res) {
  const row = await Certificate.findOne({
    _id: req.params.id,
    academyId: req.academyId,
    studentId: req.user.sub,
    status: 'issued'
  }).select('+fileStorageKey');

  if (!row) return res.status(404).json({ message: 'الشهادة غير موجودة أو غير متاحة' });
  if (!row.fileStorageKey) return res.status(404).json({ message: 'ملف الشهادة غير متوفر' });

  let pdf;
  try {
    pdf = await storage.read(row.fileStorageKey);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ message: 'ملف الشهادة غير موجود في MongoDB' });
    }
    if (err.code === 'LEGACY_STORAGE_KEY') {
      return res.status(409).json({
        message: 'ملف الشهادة قديم ويحتاج ترحيل إلى MongoDB قبل تنزيله'
      });
    }
    throw err;
  }

  row.downloadCount = Number(row.downloadCount || 0) + 1;
  row.lastDownloadedAt = new Date();
  await row.save().catch(err => console.warn('[certificate download stats]', err.message));

  return sendPdf(
    res,
    row,
    pdf,
    req.query.download === '1'
  );
}

module.exports = {
  listAcademy,
  upload,
  replaceFile,
  setStatus,
  academyFile,
  listStudent,
  studentFile
};
