const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
  instructorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  name: { type: String, required: true, trim: true },
  schedule: String,
  room: String,
  capacity: { type: Number, default: 20, min: 1 },
  startAt: Date,
  endAt: Date,
  status: { type: String, enum: ['planned','active','completed','cancelled'], default: 'planned' }
}, { timestamps: true });

module.exports = mongoose.model('Group', GroupSchema);
