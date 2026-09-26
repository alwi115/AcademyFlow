const mongoose = require('mongoose');

const WatchedRangeSchema = new mongoose.Schema({
  start: { type: Number, required: true, min: 0 },
  end: { type: Number, required: true, min: 0 }
}, { _id: false });

const LessonProgressSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true, index: true },

  completed: { type: Boolean, default: false, index: true },
  completedAt: { type: Date, default: null },

  durationSeconds: { type: Number, default: 0, min: 0 },
  watchedSeconds: { type: Number, default: 0, min: 0 },
  watchedPercent: { type: Number, default: 0, min: 0, max: 100 },
  watchedRanges: { type: [WatchedRangeSchema], default: [] },

  lastPositionSeconds: { type: Number, default: 0, min: 0 },
  maxPositionSeconds: { type: Number, default: 0, min: 0 },
  lastPlayerState: { type: Number, default: -1 },
  lastReportedAt: { type: Date, default: null },
  lastOpenedAt: { type: Date, default: Date.now }
}, { timestamps: true });

LessonProgressSchema.index(
  { academyId: 1, studentId: 1, lessonId: 1 },
  { unique: true }
);

module.exports = mongoose.model('LessonProgress', LessonProgressSchema);
