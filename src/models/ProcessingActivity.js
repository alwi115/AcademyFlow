const mongoose = require('mongoose');

const ProcessingActivitySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true, maxlength: 120 },
  name: { type: String, required: true, trim: true, maxlength: 240 },
  purpose: { type: String, required: true, trim: true, maxlength: 2000 },
  dataCategories: [{ type: String, trim: true, maxlength: 240 }],
  dataSubjects: [{ type: String, trim: true, maxlength: 240 }],
  authorizedRoles: [{ type: String, trim: true, maxlength: 120 }],
  retentionPeriod: { type: String, required: true, trim: true, maxlength: 1000 },
  deletionMechanism: { type: String, required: true, trim: true, maxlength: 1500 },
  recipients: [{ type: String, trim: true, maxlength: 240 }],
  transferDestinations: [{ type: String, trim: true, maxlength: 240 }],
  securityMeasures: [{ type: String, trim: true, maxlength: 500 }],
  systemManaged: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  lastReviewedAt: { type: Date, default: Date.now },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

module.exports = mongoose.model('ProcessingActivity', ProcessingActivitySchema);
