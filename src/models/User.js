const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  academyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Academy', default: null, index: true },
  name: { type: String, required: true, trim: true },
  username: {
    type: String,
    trim: true,
    lowercase: true,
    minlength: 3,
    maxlength: 40,
    match: /^[a-z0-9._-]+$/
  },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: String,
  passwordHash: {
    type: String,
    required: true,
    select: false,
    validate: {
      validator(value) {
        return /^\$2[aby]\$\d{2}\$/.test(value);
      },
      message: 'passwordHash must be a bcrypt hash'
    }
  },
  role: {
    type: String,
    enum: ['superadmin','owner','admin','branch_manager','instructor','accountant','reception','content_manager','support','student'],
    required: true
  },
  active: { type: Boolean, default: true },
  failedLoginAttempts: { type: Number, default: 0, select: false, min: 0 },
  lockUntil: { type: Date, default: null, select: false },
  lastLoginAt: Date
}, { timestamps: true });

UserSchema.index({ academyId: 1, email: 1 }, { unique: true });
UserSchema.index(
  { academyId: 1, username: 1 },
  {
    unique: true,
    partialFilterExpression: { username: { $type: 'string' } }
  }
);

module.exports = mongoose.model('User', UserSchema);
