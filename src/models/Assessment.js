const mongoose = require('mongoose');

const AssessmentSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  type: { type: String, enum: ['quiz','assignment'], required: true, index: true },
  title: { type: String, required: true, trim: true },
  description: String,
  availableFrom: Date,
  dueAt: Date,
  totalMarks: { type: Number, default: 100, min: 1 },
  passingMark: { type: Number, default: 50, min: 0 },
  passingPercentage: { type: Number, default: 50, min: 0, max: 100 },
  durationMinutes: { type: Number, default: 0, min: 0, max: 1440 },
  maxAttempts: { type: Number, default: 1, min: 1, max: 100 },
  shuffleQuestions: { type: Boolean, default: true },
  shuffleOptions: { type: Boolean, default: true },
  showCorrectAnswers: { type: Boolean, default: false },
  status: { type: String, enum: ['draft','published','closed'], default: 'draft' }
}, { timestamps: true });

AssessmentSchema.index({ academyId: 1, courseId: 1, type: 1, status: 1 });

module.exports = mongoose.model('Assessment', AssessmentSchema);
