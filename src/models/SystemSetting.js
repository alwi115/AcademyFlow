const mongoose = require('mongoose');

const SystemSettingSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'platform' },
  platformName: { type: String, default: 'AcademyFlow' },
  defaultTrialDays: { type: Number, default: 15, min: 0, max: 365 },
  defaultGraceDays: { type: Number, default: 5, min: 0, max: 90 },
  defaultCurrency: { type: String, default: 'OMR', trim: true, uppercase: true },
  supportEmail: { type: String, default: '', trim: true, lowercase: true },
  supportPhone: { type: String, default: '', trim: true },
  legalEntityName: { type: String, default: '', trim: true, maxlength: 240 },
  commercialRegistrationNumber: { type: String, default: '', trim: true, maxlength: 120 },
  taxNumber: { type: String, default: '', trim: true, maxlength: 120 },
  businessAddress: { type: String, default: '', trim: true, maxlength: 500 },
  privacyOfficerEmail: { type: String, default: '', trim: true, lowercase: true, maxlength: 254 },
  maintenanceMode: { type: Boolean, default: false },
  announcement: { type: String, default: '', maxlength: 500 }
}, { timestamps: true });

module.exports = mongoose.model('SystemSetting', SystemSettingSchema);
