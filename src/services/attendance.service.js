const Attendance = require('../models/Attendance');
async function saveAttendance(data) {
  const date = new Date(data.date);
  if (!Number.isFinite(date.getTime())) throw Object.assign(new Error('Invalid attendance date'), { status: 400 });
  date.setUTCHours(0, 0, 0, 0);
  const filter = { academyId: data.academyId, studentId: data.studentId, courseId: data.courseId, groupId: data.groupId || null, date };
  const update = { $set: { status: data.status, note: data.note || '' } };
  try { return await Attendance.findOneAndUpdate(filter, update, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }); }
  catch (err) {
    if (err.code !== 11000) throw err;
    return Attendance.findOneAndUpdate(filter, update, { new: true, runValidators: true });
  }
}
module.exports = { saveAttendance };
