const mongoose = require('mongoose');

const CompensationProgressSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  moduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'CompensationModule', required: true, index: true },
  liveSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSession', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  status: { type: String, enum: ['pending','completed'], default: 'pending', index: true },
  attempts: { type: Number, default: 0, min: 0 },
  bestPercentage: { type: Number, default: 0, min: 0, max: 100 },
  lastSubmittedAt: Date,
  completedAt: Date
}, { timestamps: true });

CompensationProgressSchema.index(
  { academyId: 1, liveSessionId: 1, studentId: 1 },
  { unique: true }
);

module.exports = mongoose.model('CompensationProgress', CompensationProgressSchema);
