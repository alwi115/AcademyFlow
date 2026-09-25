const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', default: null, index: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: String,
  passwordHash: { type: String, required: true,
  },
  role: {
    type: String,
    enum: ['superadmin','owner','admin','branch_manager','instructor','accountant','reception','content_manager','support','student'],
    required: true
  },
  active: { type: Boolean, default: true },
  lastLoginAt: Date
}, { timestamps: true });

UserSchema.index({ academyId: 1, email: 1 }, { unique: true });

module.exports = mongoose.model('User', UserSchema);
