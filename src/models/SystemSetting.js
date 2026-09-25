const mongoose = require('mongoose');

const SystemSettingSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'platform' },
  platformName: { type: String, default: 'AcademyFlow' },
  defaultTrialDays: { type: Number, default: 15, min: 0, max: 365 },
  defaultGraceDays: { type: Number, default: 5, min: 0, max: 90 },
  defaultCurrency: { type: String, default: 'OMR', trim: true, uppercase: true },
  supportEmail: { type: String, default: '', trim: true, lowercase: true },
  supportPhone: { type: String, default: '', trim: true },
  maintenanceMode: { type: Boolean, default: false },
  announcement: { type: String, default: '', maxlength: 500 }
}, { timestamps: true });

module.exports = mongoose.model('SystemSetting', SystemSettingSchema);
