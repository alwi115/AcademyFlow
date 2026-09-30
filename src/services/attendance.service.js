const Attendance = require('../models/Attendance');
const { objectId, optionalObjectId, enumValue } = require('../utils/security-input');

const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'excused'];

function safeNote(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    const err = new Error('Invalid attendance note');
    err.status = 400;
    throw err;
  }
  return value.trim().slice(0, 2000);
}

async function saveAttendance(data = {}) {
  const academyId = objectId(data.academyId, 'Invalid academy id');
  const studentId = objectId(data.studentId, 'Invalid student id');
  const courseId = objectId(data.courseId, 'Invalid course id');
  const groupId = optionalObjectId(data.groupId, 'Invalid group id');
  const status = enumValue(data.status || 'present', ATTENDANCE_STATUSES, 'Invalid attendance status');

  const date = new Date(data.date);
  if (!Number.isFinite(date.getTime())) {
    const err = new Error('Invalid attendance date');
    err.status = 400;
    throw err;
  }
  date.setUTCHours(0, 0, 0, 0);

  const filter = { academyId, studentId, courseId, groupId, date };
  const update = { $set: { status, note: safeNote(data.note) } };

  try {
    return await Attendance.findOneAndUpdate(
      filter,
      update,
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    if (err.code !== 11000) throw err;
    return Attendance.findOneAndUpdate(
      filter,
      update,
      { new: true, runValidators: true }
    );
  }
}

module.exports = { saveAttendance };
