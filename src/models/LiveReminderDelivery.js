const mongoose = require('mongoose');

const LiveReminderDeliverySchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  liveSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSession', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  channel: { type: String, enum: ['in_app','email'], required: true },
  status: { type: String, enum: ['pending','sent','failed','skipped'], default: 'pending', index: true },
  attempts: { type: Number, default: 0, min: 0 },
  sentAt: Date,
  lastAttemptAt: Date,
  error: { type: String, default: '', maxlength: 1000 }
}, { timestamps: true });

LiveReminderDeliverySchema.index(
  { academyId: 1, liveSessionId: 1, studentId: 1, channel: 1 },
  { unique: true }
);

module.exports = mongoose.model('LiveReminderDelivery', LiveReminderDeliverySchema);
