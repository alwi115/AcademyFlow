const mongoose = require('mongoose');

const PrivacyIncidentSchema = new mongoose.Schema({
  incidentNumber: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 240 },
  detectedAt: { type: Date, required: true, default: Date.now },
  occurredAt: { type: Date, default: null },
  description: { type: String, required: true, trim: true, maxlength: 5000 },
  dataCategories: [{ type: String, trim: true, maxlength: 240 }],
  affectedSubjectsEstimate: { type: Number, default: 0, min: 0 },
  riskLevel: {
    type: String,
    enum: ['low','medium','high','critical'],
    default: 'medium',
    index: true
  },
  rightsRisk: { type: Boolean, default: false },
  highRiskToSubjects: { type: Boolean, default: false },
  containmentActions: { type: String, default: '', maxlength: 5000 },
  correctiveActions: { type: String, default: '', maxlength: 5000 },
  authorityNotificationRequired: { type: Boolean, default: false },
  authorityNotifiedAt: { type: Date, default: null },
  subjectsNotificationRequired: { type: Boolean, default: false },
  subjectsNotifiedAt: { type: Date, default: null },
  status: {
    type: String,
    enum: ['open','contained','closed'],
    default: 'open',
    index: true
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

PrivacyIncidentSchema.index({ status: 1, detectedAt: -1 });

module.exports = mongoose.model('PrivacyIncident', PrivacyIncidentSchema);
