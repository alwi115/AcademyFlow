const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  notificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['staged', 'queued', 'processing', 'sent', 'failed', 'skipped'], default: 'queued' },
  attempts: { type: Number, default: 0 },
  retryAt: { type: Date, default: Date.now },
  leaseUntil: Date,
  errorCode: String,
  sentAt: Date
}, { timestamps: true });
schema.index({ notificationId: 1, userId: 1 }, { unique: true });
schema.index({ status: 1, retryAt: 1 });
module.exports = mongoose.model('NotificationDelivery', schema);
