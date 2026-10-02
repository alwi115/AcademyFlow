const mongoose = require('mongoose');

const LiveAttendanceSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  liveSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSession', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },

  attendanceStatus: {
    type: String,
    enum: ['present','late','absent','excused','compensated'],
    default: 'present',
    index: true
  },
  lateMinutes: { type: Number, default: 0, min: 0 },

  firstPortalAt: Date,
  lastPortalAt: Date,
  portalJoinCount: { type: Number, default: 0, min: 0 },

  firstJoinedAt: Date,
  lastJoinedAt: Date,
  leftAt: Date,
  totalDurationSeconds: { type: Number, default: 0, min: 0 },
  zoomJoinCount: { type: Number, default: 0, min: 0 },
  zoomParticipantIds: [{ type: String }],
  lastZoomParticipantId: { type: String, default: '' },

  verifiedByZoom: { type: Boolean, default: false, index: true },
  source: {
    type: String,
    enum: ['portal','zoom','portal_zoom','manual','compensation'],
    default: 'portal'
  },
  manualOverride: { type: Boolean, default: false },
  note: { type: String, default: '', maxlength: 2000 },
  lastEventAt: Date,
  lastZoomEventAt: Date
}, { timestamps: true });

LiveAttendanceSchema.index(
  { academyId: 1, liveSessionId: 1, studentId: 1 },
  { unique: true }
);

LiveAttendanceSchema.index({ academyId: 1, liveSessionId: 1, attendanceStatus: 1 });

module.exports = mongoose.model('LiveAttendance', LiveAttendanceSchema);
