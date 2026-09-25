const mongoose = require('mongoose');

const LessonProgressSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true, index: true },
  completed: { type: Boolean, default: true },
  completedAt: { type: Date, default: Date.now },
  lastOpenedAt: { type: Date, default: Date.now }
}, { timestamps: true });

LessonProgressSchema.index(
  { academyId: 1, studentId: 1, lessonId: 1 },
  { unique: true }
);

module.exports = mongoose.model('LessonProgress', LessonProgressSchema);
