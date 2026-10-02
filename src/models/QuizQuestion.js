const mongoose = require('mongoose');

const OptionSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true, maxlength: 1000 },
  isCorrect: { type: Boolean, default: false }
});

const QuizQuestionSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', default: null, index: true },
  type: {
    type: String,
    enum: ['multiple_choice','true_false','short_answer'],
    required: true
  },
  prompt: { type: String, required: true, trim: true, maxlength: 5000 },
  audioUrl: { type: String, default: '', trim: true, maxlength: 2048 },
  audioTitle: { type: String, default: '', trim: true, maxlength: 200 },
  options: { type: [OptionSchema], default: [] },
  correctBoolean: { type: Boolean, default: null, select: false },
  explanation: { type: String, default: '', trim: true, maxlength: 5000, select: false },
  marks: { type: Number, default: 1, min: 0.25, max: 1000 },
  order: { type: Number, default: 1, min: 1 }
}, { timestamps: true });

QuizQuestionSchema.index({ academyId: 1, assessmentId: 1, order: 1 });

module.exports = mongoose.model('QuizQuestion', QuizQuestionSchema);
