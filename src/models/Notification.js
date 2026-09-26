const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true },
  audience: { type: String, enum: ['all','students','instructors','staff'], default: 'all' },
  channel: { type: String, enum: ['in_app','email','whatsapp'], default: 'in_app' },
  status: { type: String, enum: ['draft','sent'], default: 'sent' },
  sentAt: Date
}, { timestamps: true });

NotificationSchema.index({ academyId: 1, courseId: 1, sentAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
