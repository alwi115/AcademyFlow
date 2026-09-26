const mongoose = require('mongoose');

const SystemAlertSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  severity: {
    type: String,
    enum: ['info','warning','critical'],
    default: 'warning',
    index: true
  },
  title: { type: String, required: true, maxlength: 240 },
  message: { type: String, default: '', maxlength: 3000 },
  active: { type: Boolean, default: true, index: true },
  firstSeenAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now, index: true },
  lastNotifiedAt: { type: Date, default: null },
  resolvedAt: { type: Date, default: null },
  occurrences: { type: Number, default: 1, min: 1 },
  details: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

SystemAlertSchema.index({ active: 1, severity: 1, lastSeenAt: -1 });

module.exports = mongoose.model('SystemAlert', SystemAlertSchema);
