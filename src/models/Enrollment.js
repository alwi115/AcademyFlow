const mongoose = require('mongoose');

const EnrollmentSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
  status: { type: String, enum: ['active','completed','cancelled','paused'], default: 'active' },
  progress: { type: Number, default: 0, min: 0, max: 100 },
  enrolledAt: { type: Date, default: Date.now }
}, { timestamps: true });

EnrollmentSchema.index({ academyId: 1, studentId: 1, courseId: 1 }, { unique: true });
module.exports = mongoose.model('Enrollment', EnrollmentSchema);
