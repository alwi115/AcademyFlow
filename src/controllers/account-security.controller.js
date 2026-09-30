const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const OTPAuth = require('otpauth');
const User = require('../models/User');
const Academy = require('../models/Academy');
const mailer = require('../services/mailer.service');
const security = require('../services/account-security.service');
const { clearSessionCookie } = require('../middleware/auth');
function validPassword(value) { return typeof value === 'string' && value.length >= 12 && Buffer.byteLength(value) <= 72; }
async function current(req) {
  return User.findOne({ _id: req.user.sub, active: true }).select('+passwordHash +sessionVersion +mfaSecretEncrypted +mfaPendingEncrypted +mfaPendingExpiresAt');
}
async function status(req, res) {
  const user = await current(req);
  res.json({ mfaEnabled: Boolean(user?.mfaEnabled), notificationPreferences: user?.notificationPreferences });
}
async function forgotPassword(req, res) {
  if (!mailer.configured() || !/^https?:\/\//.test(process.env.PUBLIC_URL || '')) {
    return res.status(503).json({ message: 'Password recovery email is not configured' });
  }
  const academyCode = typeof req.body.academyCode === 'string' ? req.body.academyCode.trim().toUpperCase() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const academy = academyCode ? await Academy.findOne({ code: academyCode }).select('_id') : null;
  const user = academyCode && !academy ? null : await User.findOne({ email, academyId: academy?._id || null, active: true });
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    await User.updateOne({ _id: user._id }, { $set: {
      passwordResetHash: security.resetHash(token), passwordResetExpiresAt: new Date(Date.now() + 30 * 60 * 1000)
    } });
    // Do not expose account existence through provider response latency.
    void mailer.sendPasswordReset({ to: user.email, token })
      .catch(err => console.error('[password-recovery]', err.code || 'delivery_failed'));
  }
  res.json({ ok: true, message: 'If the account exists, a recovery email will be sent.' });
}
async function resetPassword(req, res) {
  const { token, newPassword, otp } = req.body;
  if (!/^[a-f0-9]{64}$/.test(String(token || '')) || !validPassword(newPassword)) {
    return res.status(400).json({ message: 'Invalid recovery token or password (12 characters minimum, 72 bytes maximum)' });
  }
  const filter = { passwordResetHash: security.resetHash(token), passwordResetExpiresAt: { $gt: new Date() }, active: true };
  const user = await User.findOne(filter).select('+mfaSecretEncrypted');
  if (!user || (user.mfaEnabled && !await security.verifyMfa(user, otp))) {
    return res.status(400).json({ message: 'Invalid or expired recovery token or authenticator code' });
  }
  const updated = await User.findOneAndUpdate(filter, { $set: { passwordHash: await bcrypt.hash(newPassword, 12), failedLoginAttempts: 0, lockUntil: null },
    $inc: { sessionVersion: 1 }, $unset: { passwordResetHash: '', passwordResetExpiresAt: '' } }, { new: true, runValidators: true });
  if (!updated) return res.status(400).json({ message: 'Recovery token already used' });
  clearSessionCookie(res);
  res.json({ ok: true });
}
async function changePassword(req, res) {
  const user = await current(req);
  if (!validPassword(req.body.newPassword) || typeof req.body.currentPassword !== 'string' ||
      !user || !await bcrypt.compare(req.body.currentPassword, user.passwordHash) ||
      (user.mfaEnabled && !await security.verifyMfa(user, req.body.otp))) {
    return res.status(400).json({ message: 'Invalid password or authenticator code' });
  }
  const version = Number(user.sessionVersion || 0);
  const filter = { _id: user._id, active: true, passwordHash: user.passwordHash,
    ...(version ? { sessionVersion: version } : { $or: [{ sessionVersion: 0 }, { sessionVersion: { $exists: false } }] }) };
  const updated = await User.updateOne(filter, {
    $set: { passwordHash: await bcrypt.hash(req.body.newPassword, 12) }, $inc: { sessionVersion: 1 },
    $unset: { passwordResetHash: '', passwordResetExpiresAt: '' }
  }, { runValidators: true });
  if (updated.modifiedCount !== 1) return res.status(409).json({ message: 'Account security changed; sign in again' });
  clearSessionCookie(res);
  res.json({ ok: true });
}
async function setupMfa(req, res) {
  const user = await current(req);
  if (!user || user.mfaEnabled || typeof req.body.password !== 'string' || !await bcrypt.compare(req.body.password, user.passwordHash)) {
    return res.status(400).json({ message: 'Invalid password or MFA already enabled' });
  }
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  const updated = await User.updateOne({ _id: user._id, mfaEnabled: false }, { $set: {
    mfaPendingEncrypted: security.encrypt(secret), mfaPendingExpiresAt: new Date(Date.now() + 10 * 60 * 1000)
  } });
  if (updated.modifiedCount !== 1) return res.status(409).json({ message: 'MFA setup changed; reload and retry' });
  res.set('Cache-Control', 'no-store');
  res.json({ secret, uri: security.totp(secret, user.email).toString() });
}
async function confirmMfa(req, res) {
  const user = await current(req);
  if (!user || user.mfaEnabled || !user.mfaPendingExpiresAt || user.mfaPendingExpiresAt <= new Date() || !await security.verifyMfa(user, req.body.otp, true)) {
    return res.status(400).json({ message: 'Invalid or expired authenticator setup' });
  }
  const updated = await User.updateOne({ _id: user._id, mfaEnabled: false, mfaPendingEncrypted: user.mfaPendingEncrypted }, {
    $set: { mfaEnabled: true, mfaSecretEncrypted: user.mfaPendingEncrypted }, $inc: { sessionVersion: 1 },
    $unset: { mfaPendingEncrypted: '', mfaPendingExpiresAt: '' }
  });
  if (updated.modifiedCount !== 1) return res.status(409).json({ message: 'MFA setup changed; reload and retry' });
  clearSessionCookie(res);
  res.json({ ok: true });
}
async function disableMfa(req, res) {
  const user = await current(req);
  if (!user || !user.mfaEnabled || typeof req.body.password !== 'string' || !await bcrypt.compare(req.body.password, user.passwordHash) || !await security.verifyMfa(user, req.body.otp)) {
    return res.status(400).json({ message: 'Invalid password or authenticator code' });
  }
  await User.updateOne({ _id: user._id }, { $set: { mfaEnabled: false, mfaLastStep: -1 }, $inc: { sessionVersion: 1 },
    $unset: { mfaSecretEncrypted: '', mfaPendingEncrypted: '', mfaPendingExpiresAt: '' } });
  clearSessionCookie(res);
  res.json({ ok: true });
}
async function preferences(req, res) {
  if (typeof req.body.email !== 'boolean' || typeof req.body.whatsapp !== 'boolean') return res.status(400).json({ message: 'Invalid notification preferences' });
  await User.updateOne({ _id: req.user.sub }, { $set: { notificationPreferences: { email: req.body.email, whatsapp: req.body.whatsapp } } });
  res.json({ ok: true });
}
module.exports = { status, forgotPassword, resetPassword, changePassword, setupMfa, confirmMfa, disableMfa, preferences };
