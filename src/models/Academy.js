const mongoose = require('mongoose');

const AcademySchema = new mongoose.Schema({
  code: { type: String, unique: true, required: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  nameEn: { type: String, trim: true },
  slug: { type: String, unique: true, required: true, lowercase: true, trim: true },
  logoUrl: String,
  phone: String,
  email: String,
  country: { type: String, default: 'Oman' },
  city: String,
  currency: { type: String, default: 'OMR' },
  timezone: { type: String, default: 'Asia/Muscat' },
  status: { type: String, enum: ['trial','active','grace','frozen','suspended'], default: 'trial' },
  trialEndsAt: Date,
  graceEndsAt: Date,
  subscriptionEndsAt: Date,
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
  branding: {
    primaryColor: { type: String, default: '#8B1E2D' },
    secondaryColor: { type: String, default: '#111827' },
    coverUrl: String
  },
  engagementFeatures: {
    compensationEnabled: { type: Boolean, default: true },
    gapMapEnabled: { type: Boolean, default: true },
    compensationPassingPercentage: { type: Number, default: 60, min: 0, max: 100 }
  },
  zoomIntegration: {
    connected: { type: Boolean, default: false },
    zoomUserId: { type: String, default: '' },
    zoomEmail: { type: String, default: '' },
    zoomDisplayName: { type: String, default: '' },
    tokensEncrypted: { type: String, default: '', select: false },
    accessTokenExpiresAt: Date,
    connectedAt: Date,
    connectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    oauthStateHash: { type: String, default: '', select: false },
    oauthStateExpiresAt: { type: Date, select: false }
  }
}, { timestamps: true });

module.exports = mongoose.model('Academy', AcademySchema);
