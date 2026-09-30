const mongoose = require('mongoose');

const SessionFeedbackSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  liveSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSession', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
  rating: {
    type: String,
    enum: ['understood','partial','lost'],
    required: true,
    index: true
  },
  hardestPoint: { type: String, default: '', trim: true, maxlength: 1200 }
}, { timestamps: true });

SessionFeedbackSchema.index(
  { academyId: 1, liveSessionId: 1, studentId: 1 },
  { unique: true }
);

module.exports = mongoose.model('SessionFeedback', SessionFeedbackSchema);
