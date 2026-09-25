const mongoose = require('mongoose');

const CourseSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  title: { type: String, required: true, trim: true },
  code: { type: String, trim: true, uppercase: true },
  description: String,
  category: String,
  deliveryType: { type: String, enum: ['recorded','live','in_person','hybrid'], default: 'recorded' },
  instructorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  price: { type: Number, default: 0, min: 0 },
  startAt: Date,
  endAt: Date,
  thumbnailUrl: String,
  status: { type: String, enum: ['draft','active','archived'], default: 'draft' }
}, { timestamps: true });

CourseSchema.index({ academyId: 1, code: 1 }, { unique: true, sparse: true });
module.exports = mongoose.model('Course', CourseSchema);
