const mongoose = require('mongoose');

const AssessmentSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  type: { type: String, enum: ['quiz','assignment'], required: true, index: true },
  title: { type: String, required: true, trim: true },
  description: String,
  dueAt: Date,
  totalMarks: { type: Number, default: 100, min: 1 },
  passingMark: { type: Number, default: 50, min: 0 },
  durationMinutes: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['draft','published','closed'], default: 'draft' }
}, { timestamps: true });

module.exports = mongoose.model('Assessment', AssessmentSchema);
