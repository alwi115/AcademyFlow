const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  actorRole: { type: String, default: '' },
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', default: null, index: true },
  action: { type: String, required: true, index: true },
  targetType: { type: String, required: true, index: true },
  targetId: { type: String, default: '' },
  targetLabel: { type: String, default: '' },
  method: { type: String, default: '' },
  path: { type: String, default: '' },
  statusCode: { type: Number, default: null },
  ip: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  requestId: { type: String, default: '', index: true },
  source: { type: String, enum: ['controller','middleware','system'], default: 'controller' },
  before: { type: mongoose.Schema.Types.Mixed, default: null },
  after: { type: mongoose.Schema.Types.Mixed, default: null },
  details: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ academyId: 1, createdAt: -1 });
AuditLogSchema.index({ actorId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
