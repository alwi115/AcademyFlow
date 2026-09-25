const mongoose = require('mongoose');

const BranchSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', required: true, index: true },
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, uppercase: true, trim: true },
  city: String,
  address: String,
  phone: String,
  email: String,
  active: { type: Boolean, default: true }
}, { timestamps: true });

BranchSchema.index({ academyId: 1, code: 1 }, { unique: true });
module.exports = mongoose.model('Branch', BranchSchema);
