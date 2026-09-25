const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true },
  audience: { type: String, enum: ['all','students','instructors','staff'], default: 'all' },
  channel: { type: String, enum: ['in_app','email','whatsapp'], default: 'in_app' },
  status: { type: String, enum: ['draft','sent'], default: 'sent' },
  sentAt: Date
}, { timestamps: true });

module.exports = mongoose.model('Notification', NotificationSchema);
