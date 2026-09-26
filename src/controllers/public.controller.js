const crypto = require('crypto');
const SystemSetting = require('../models/SystemSetting');
const PrivacyRequest = require('../models/PrivacyRequest');
const mailer = require('../services/mailer.service');
const { CURRENT_LEGAL_VERSION } = require('../config/legal');

async function platformSettings() {
  return SystemSetting.findOneAndUpdate(
    { key: 'platform' },
    { $setOnInsert: { key: 'platform' } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
}

function clean(value, max = 4000) {
  return String(value || '').trim().slice(0, max);
}

function emailValid(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function requestNumber() {
  const d = new Date();
  const date = [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0')
  ].join('');
  return 'PR-' + date + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function legalConfig(req, res) {
  const settings = await platformSettings();

  res.set({
    'Cache-Control': 'public, max-age=300',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'"
  });

  res.json({
    platformName: settings.platformName || 'AcademyFlow',
    trialDays: Number(settings.defaultTrialDays ?? 15),
    graceDays: Number(settings.defaultGraceDays ?? 5),
    supportEmail: settings.supportEmail || '',
    supportPhone: settings.supportPhone || '',
    legalEntityName: settings.legalEntityName || '',
    commercialRegistrationNumber: settings.commercialRegistrationNumber || '',
    taxNumber: settings.taxNumber || '',
    businessAddress: settings.businessAddress || '',
    privacyOfficerEmail: settings.privacyOfficerEmail || '',
    legalVersion: CURRENT_LEGAL_VERSION,
    jurisdiction: 'Sultanate of Oman'
  });
}

async function createPrivacyRequest(req, res) {
  // Honeypot: bots often fill hidden fields.
  if (clean(req.body?.website, 200)) {
    return res.status(202).json({ ok: true });
  }

  const type = clean(req.body?.type, 40);
  const name = clean(req.body?.name, 160);
  const email = clean(req.body?.email, 254).toLowerCase();
  const phone = clean(req.body?.phone, 40);
  const academyCode = clean(req.body?.academyCode, 32).toUpperCase();
  const details = clean(req.body?.details, 4000);

  const allowed = new Set([
    'access',
    'correction',
    'deletion',
    'portability',
    'objection',
    'withdraw_consent',
    'complaint'
  ]);

  if (!allowed.has(type) || !name || !emailValid(email)) {
    return res.status(400).json({ message: 'تحقق من نوع الطلب والاسم والبريد الإلكتروني.' });
  }

  if (academyCode && !/^[A-Z0-9-]{3,32}$/.test(academyCode)) {
    return res.status(400).json({ message: 'كود الأكاديمية غير صالح.' });
  }

  let requestNo = requestNumber();
  while (await PrivacyRequest.exists({ requestNumber: requestNo })) {
    requestNo = requestNumber();
  }

  const row = await PrivacyRequest.create({
    requestNumber: requestNo,
    type,
    name,
    email,
    phone,
    academyCode,
    details,
    sourceIp: String(req.ip || '').replace(/^::ffff:/, '').slice(0, 100),
    userAgent: String(req.get('user-agent') || '').slice(0, 500)
  });

  try {
    const settings = await platformSettings();
    const notifyTo = settings.supportEmail || process.env.SUPERADMIN_EMAIL || '';

    if (notifyTo && mailer.configured()) {
      await mailer.sendSystemAlert({
        to: notifyTo,
        severity: 'info',
        title: 'طلب خصوصية جديد · ' + row.requestNumber,
        message: 'تم استلام طلب خصوصية جديد ويحتاج مراجعة والتحقق من هوية مقدم الطلب.',
        details: {
          type: row.type,
          academyCode: row.academyCode || '—',
          requestNumber: row.requestNumber
        }
      });
    }
  } catch (err) {
    console.error('[privacy-request-notification]', err.message);
  }

  res.status(201).json({
    ok: true,
    requestNumber: row.requestNumber,
    status: row.status,
    message: 'تم استلام طلبك. قد نطلب معلومات إضافية للتحقق من الهوية قبل تنفيذ الطلب.'
  });
}

module.exports = {
  legalConfig,
  createPrivacyRequest
};
