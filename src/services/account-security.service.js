const crypto = require('crypto');
const OTPAuth = require('otpauth');
const User = require('../models/User');
function key() { return crypto.createHash('sha256').update('mfa:' + process.env.JWT_SECRET).digest(); }
function encrypt(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv, { authTagLength: 16 });
  const body = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}
function decrypt(value) {
  const bytes = Buffer.from(value, 'base64');
  const cipher = crypto.createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12), { authTagLength: 16 });
  cipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8');
}
function totp(secret, label = 'Account') {
  return new OTPAuth.TOTP({ issuer: 'AcademyFlow', label, algorithm: 'SHA1', digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) });
}
async function verifyMfa(user, token, pending = false) {
  if (!/^\d{6}$/.test(String(token || ''))) return false;
  const encrypted = pending ? user.mfaPendingEncrypted : user.mfaSecretEncrypted;
  if (!encrypted) return false;
  const timestamp = Date.now();
  const delta = totp(decrypt(encrypted)).validate({ token: String(token), timestamp, window: 1 });
  if (delta === null) return false;
  const step = Math.floor(timestamp / 30000) + delta;
  const row = await User.findOneAndUpdate({ _id: user._id,
    $or: [{ mfaLastStep: { $lt: step } }, { mfaLastStep: { $exists: false } }] },
  { $set: { mfaLastStep: step } }, { new: true });
  return Boolean(row);
}
function resetHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
module.exports = { encrypt, decrypt, totp, verifyMfa, resetHash };
