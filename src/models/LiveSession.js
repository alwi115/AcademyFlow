const mongoose = require('mongoose');

const LiveSessionSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
  title: { type: String, required: true },
  description: String,
  instructorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  startAt: { type: Date, required: true },
  durationMinutes: { type: Number, default: 60 },
  provider: { type: String, enum: ['zoom'], default: 'zoom' },
  zoomMeetingId: String,
  zoomJoinUrl: String,
  zoomStartUrl: String,
  zoomPassword: String,
  status: { type: String, enum: ['scheduled','live','ended','cancelled'], default: 'scheduled' }
}, { timestamps: true });

module.exports = mongoose.model('LiveSession', LiveSessionSchema);
