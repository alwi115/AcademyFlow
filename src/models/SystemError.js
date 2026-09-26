const mongoose = require('mongoose');

const SystemErrorSchema = new mongoose.Schema({
  status: { type: Number, default: 500, index: true },
  method: { type: String, default: '' },
  path: { type: String, default: '' },
  message: { type: String, default: '', maxlength: 1500 },
  code: { type: String, default: '', maxlength: 120 },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  actorRole: { type: String, default: '' },
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', default: null, index: true }
}, { timestamps: true });

SystemErrorSchema.index({ createdAt: -1 });
SystemErrorSchema.index({ academyId: 1, createdAt: -1 });

module.exports = mongoose.model('SystemError', SystemErrorSchema);
