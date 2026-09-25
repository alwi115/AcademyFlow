const mongoose = require('mongoose');

const AssignmentSubmissionSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment', required: true, index: true },
  answerText: { type: String, default: '', maxlength: 10000 },
  attachmentUrl: { type: String, default: '', maxlength: 2000 },
  status: { type: String, enum: ['submitted','graded'], default: 'submitted' },
  score: { type: Number, default: null },
  feedback: { type: String, default: '', maxlength: 5000 },
  submittedAt: { type: Date, default: Date.now },
  gradedAt: Date
}, { timestamps: true });

AssignmentSubmissionSchema.index(
  { academyId: 1, studentId: 1, assessmentId: 1 },
  { unique: true }
);

module.exports = mongoose.model('AssignmentSubmission', AssignmentSubmissionSchema);
