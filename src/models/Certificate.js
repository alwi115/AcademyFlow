const mongoose = require('mongoose');

const CertificateSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  certificateNo: { type: String, required: true, trim: true },
  issuedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['issued','revoked'], default: 'issued', index: true },

  fileStorageKey: { type: String, default: '', select: false },
  fileName: { type: String, default: '' },
  fileMimeType: { type: String, default: 'application/pdf' },
  fileSize: { type: Number, default: 0, min: 0 },
  fileUploadedAt: { type: Date, default: null },
  fileUploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  deliveredAt: { type: Date, default: null },
  downloadCount: { type: Number, default: 0, min: 0 },
  lastDownloadedAt: { type: Date, default: null }
}, { timestamps: true });

CertificateSchema.index({ academyId: 1, certificateNo: 1 }, { unique: true });
CertificateSchema.index({ academyId: 1, studentId: 1, issuedAt: -1 });

module.exports = mongoose.model('Certificate', CertificateSchema);
