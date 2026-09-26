const mongoose = require('mongoose');

const LiveSeriesSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null, index: true },
  instructorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  weekdays: [{ type: Number, min: 0, max: 6 }],
  time: { type: String, required: true },
  timezone: { type: String, default: 'Asia/Muscat' },
  durationMinutes: { type: Number, default: 60, min: 1 },
  attendanceEnabled: { type: Boolean, default: true },
  lateAfterMinutes: { type: Number, default: 10, min: 0, max: 240 },
  joinWindowBeforeMinutes: { type: Number, default: 15, min: 0, max: 240 },
  reminderMinutes: { type: Number, default: 5, min: 0, max: 1440 },
  notifyInApp: { type: Boolean, default: true },
  notifyEmail: { type: Boolean, default: true },
  sessionCount: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['active','cancelled'], default: 'active', index: true }
}, { timestamps: true });

LiveSeriesSchema.index({ academyId: 1, instructorId: 1, createdAt: -1 });

module.exports = mongoose.model('LiveSeries', LiveSeriesSchema);
