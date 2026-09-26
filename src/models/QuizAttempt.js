const mongoose = require('mongoose');

const AttemptAnswerSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'QuizQuestion', required: true },
  selectedOptionId: { type: String, default: '' },
  booleanAnswer: { type: Boolean, default: null },
  textAnswer: { type: String, default: '', maxlength: 10000 },
  awardedMarks: { type: Number, default: null },
  isCorrect: { type: Boolean, default: null },
  needsManualReview: { type: Boolean, default: false },
  feedback: { type: String, default: '', maxlength: 5000 }
}, { _id: false });

const QuizAttemptSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  attemptNumber: { type: Number, required: true, min: 1 },
  status: {
    type: String,
    enum: ['in_progress','submitted','pending_review','graded','expired'],
    default: 'in_progress',
    index: true
  },
  startedAt: { type: Date, default: Date.now },
  expiresAt: Date,
  submittedAt: Date,
  questionOrder: [{ type: mongoose.Schema.Types.ObjectId, ref: 'QuizQuestion' }],
  optionOrders: { type: mongoose.Schema.Types.Mixed, default: {} },
  answers: { type: [AttemptAnswerSchema], default: [] },
  score: { type: Number, default: 0, min: 0 },
  totalMarks: { type: Number, default: 0, min: 0 },
  percentage: { type: Number, default: 0, min: 0, max: 100 },
  passed: { type: Boolean, default: false },
  requiresManualReview: { type: Boolean, default: false }
}, { timestamps: true });

QuizAttemptSchema.index(
  { academyId: 1, assessmentId: 1, studentId: 1, attemptNumber: 1 },
  { unique: true }
);

module.exports = mongoose.model('QuizAttempt', QuizAttemptSchema);
