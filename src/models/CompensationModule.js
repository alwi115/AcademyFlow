const mongoose = require('mongoose');

const CompensationQuestionSchema = new mongoose.Schema({
  prompt: { type: String, required: true, trim: true, maxlength: 2000 },
  options: {
    type: [{ type: String, trim: true, maxlength: 500 }],
    validate: value => Array.isArray(value) && value.length >= 2 && value.length <= 6
  },
  correctIndex: { type: Number, required: true, min: 0, max: 5 },
  lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', default: null }
}, { _id: true });

const CompensationModuleSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  liveSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSession', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  title: { type: String, required: true, trim: true },
  summary: { type: String, required: true, trim: true, maxlength: 8000 },
  keyPoints: { type: [{ type: String, trim: true, maxlength: 1200 }], default: [] },
  sourceLessonIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' }],
  quiz: { type: [CompensationQuestionSchema], default: [] },
  passingPercentage: { type: Number, default: 60, min: 0, max: 100 },
  generatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

CompensationModuleSchema.index({ academyId: 1, liveSessionId: 1 }, { unique: true });

module.exports = mongoose.model('CompensationModule', CompensationModuleSchema);
