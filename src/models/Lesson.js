const mongoose = require('mongoose');

const LessonSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  title: { type: String, required: true, trim: true },
  description: String,
  order: { type: Number, default: 1, min: 1 },
  videoUrl: String,
  youtubeId: String,
  durationMinutes: { type: Number, default: 0, min: 0 },
  isPreview: { type: Boolean, default: false },
  status: { type: String, enum: ['draft','published'], default: 'draft' }
}, { timestamps: true });

module.exports = mongoose.model('Lesson', LessonSchema);
