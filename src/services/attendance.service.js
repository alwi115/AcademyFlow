const Attendance = require('../models/Attendance');
const { objectId, optionalObjectId, enumValue } = require('../utils/security-input');

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function attendanceDate(value) {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw badRequest('Invalid attendance date');
    const date = new Date(value.getTime());
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }

  if (typeof value !== 'string' && typeof value !== 'number') {
    throw badRequest('Invalid attendance date');
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw badRequest('Invalid attendance date');
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function attendanceNote(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') throw badRequest('Invalid attendance note');
  return value.trim().slice(0, 2000);
}

async function saveAttendance(data = {}) {
  const academyId = objectId(data.academyId, 'Invalid academy id');
  const studentId = objectId(data.studentId, 'Invalid student id');
  const courseId = objectId(data.courseId, 'Invalid course id');
  const groupId = optionalObjectId(data.groupId, 'Invalid group id');
  const date = attendanceDate(data.date);
  const status = enumValue(
    data.status || 'present',
    ['present', 'absent', 'late', 'excused'],
    'Invalid attendance status'
  );
  const note = attendanceNote(data.note);

  const filter = {
    academyId,
    studentId,
    courseId,
    groupId,
    date
  };

  const update = {
    $set: {
      status,
      note
    }
  };

  try {
    return await Attendance.findOneAndUpdate(filter, update, {
      upsert: true,
      new: true,
      runValidators: true,
      setDefaultsOnInsert: true
    });
  } catch (err) {
    if (err.code !== 11000) throw err;
    return Attendance.findOneAndUpdate(filter, update, {
      new: true,
      runValidators: true
    });
  }
}

module.exports = {
  saveAttendance,
  attendanceDate
};
