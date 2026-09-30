const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null, index: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null, index: true },
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  liveSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSession', default: null, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  type: { type: String, enum: ['general','course_announcement','live_reminder'], default: 'general', index: true },
  dedupeKey: { type: String },
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true },
  audience: { type: String, enum: ['all','students','instructors','staff'], default: 'all' },
  channel: { type: String, enum: ['in_app','email','whatsapp'], default: 'in_app' },
  status: { type: String, enum: ['draft','pending','sent','failed'], default: 'sent' },
  sentAt: Date,
  queueReady: { type: Boolean, default: false }
}, { timestamps: true });

NotificationSchema.index({ academyId: 1, courseId: 1, sentAt: -1 });
NotificationSchema.index(
  { dedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: { dedupeKey: { $type: 'string' } }
  }
);

module.exports = mongoose.model('Notification', NotificationSchema);
