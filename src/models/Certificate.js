const mongoose = require('mongoose');

const CertificateSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  certificateNo: { type: String, required: true, trim: true },
  issuedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['issued','revoked'], default: 'issued' }
}, { timestamps: true });

CertificateSchema.index({ academyId: 1, certificateNo: 1 }, { unique: true });
module.exports = mongoose.model('Certificate', CertificateSchema);
