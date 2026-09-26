const mongoose = require('mongoose');

const LiveSessionSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null, index: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null, index: true },
  seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSeries', default: null, index: true },
  sequenceNumber: { type: Number, default: null },
  title: { type: String, required: true },
  description: String,
  instructorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  startAt: { type: Date, required: true, index: true },
  durationMinutes: { type: Number, default: 60, min: 1 },
  provider: { type: String, enum: ['zoom'], default: 'zoom' },
  zoomMeetingId: String,
  zoomJoinUrl: String,
  zoomStartUrl: String,
  zoomPassword: String,
  zoomProvisionError: { type: String, default: '', maxlength: 1000 },

  attendanceEnabled: { type: Boolean, default: true },
  lateAfterMinutes: { type: Number, default: 10, min: 0, max: 240 },
  joinWindowBeforeMinutes: { type: Number, default: 15, min: 0, max: 240 },

  reminderMinutes: { type: Number, default: 5, min: 0, max: 1440 },
  notifyInApp: { type: Boolean, default: true },
  notifyEmail: { type: Boolean, default: true },
  reminderClaimedAt: Date,
  reminderCompletedAt: Date,
  reminderStats: {
    inApp: { type: Number, default: 0 },
    email: { type: Number, default: 0 },
    emailFailed: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 }
  },

  status: { type: String, enum: ['scheduled','live','ended','cancelled'], default: 'scheduled', index: true }
}, { timestamps: true });

LiveSessionSchema.index({ academyId: 1, instructorId: 1, startAt: 1 });
LiveSessionSchema.index({ academyId: 1, seriesId: 1, startAt: 1 });
LiveSessionSchema.index({ zoomMeetingId: 1 }, { sparse: true });
LiveSessionSchema.index({ status: 1, startAt: 1, reminderCompletedAt: 1 });

module.exports = mongoose.model('LiveSession', LiveSessionSchema);
