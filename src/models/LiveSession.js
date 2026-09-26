const mongoose = require('mongoose');

const LiveSessionSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
  title: { type: String, required: true },
  description: String,
  instructorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  startAt: { type: Date, required: true },
  durationMinutes: { type: Number, default: 60, min: 1 },
  provider: { type: String, enum: ['zoom'], default: 'zoom' },
  zoomMeetingId: String,
  zoomJoinUrl: String,
  zoomStartUrl: String,
  zoomPassword: String,
  attendanceEnabled: { type: Boolean, default: true },
  lateAfterMinutes: { type: Number, default: 10, min: 0, max: 240 },
  joinWindowBeforeMinutes: { type: Number, default: 15, min: 0, max: 240 },
  status: { type: String, enum: ['scheduled','live','ended','cancelled'], default: 'scheduled' }
}, { timestamps: true });

LiveSessionSchema.index({ academyId: 1, instructorId: 1, startAt: 1 });
LiveSessionSchema.index({ zoomMeetingId: 1 }, { sparse: true });

module.exports = mongoose.model('LiveSession', LiveSessionSchema);
