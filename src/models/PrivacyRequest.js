const mongoose = require('mongoose');

const PrivacyRequestSchema = new mongoose.Schema({
  requestNumber: { type: String, required: true, unique: true, index: true },
  type: {
    type: String,
    required: true,
    enum: [
      'access',
      'correction',
      'deletion',
      'portability',
      'objection',
      'withdraw_consent',
      'complaint'
    ],
    index: true
  },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254, index: true },
  phone: { type: String, default: '', trim: true, maxlength: 40 },
  academyCode: { type: String, default: '', trim: true, uppercase: true, maxlength: 32, index: true },
  details: { type: String, default: '', trim: true, maxlength: 4000 },
  status: {
    type: String,
    enum: ['received','verifying','in_progress','completed','rejected'],
    default: 'received',
    index: true
  },
  identityVerified: { type: Boolean, default: false },
  internalNote: { type: String, default: '', maxlength: 4000 },
  handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  completedAt: { type: Date, default: null },
  sourceIp: { type: String, default: '', maxlength: 100 },
  userAgent: { type: String, default: '', maxlength: 500 }
}, { timestamps: true });

PrivacyRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('PrivacyRequest', PrivacyRequestSchema);
