const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
  date: { type: Date, required: true },
  status: { type: String, enum: ['present','absent','late','excused'], default: 'present' },
  note: String
}, { timestamps: true });

AttendanceSchema.index({ academyId: 1, studentId: 1, courseId: 1, groupId: 1, date: 1 }, { unique: true });
module.exports = mongoose.model('Attendance', AttendanceSchema);
