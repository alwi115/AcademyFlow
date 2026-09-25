const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  actorRole: { type: String, default: 'superadmin' },
  action: { type: String, required: true, index: true },
  targetType: { type: String, required: true, index: true },
  targetId: { type: String, default: '' },
  targetLabel: { type: String, default: '' },
  details: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

AuditLogSchema.index({ createdAt: -1 });
module.exports = mongoose.model('AuditLog', AuditLogSchema);
