const Academy = require('../models/Academy');
const User = require('../models/User');
const mailer = require('../services/mailer.service');

async function status(req, res) {
  const info = mailer.configStatus();

  res.json({
    provider: info.provider,
    configured: info.configured,
    missing: info.missing,
    from: info.from || '',
    apiKeyPresent: Boolean(info.apiKeyPresent)
  });
}

async function test(req, res) {
  const [academy, user] = await Promise.all([
    Academy.findById(req.academyId).select('name'),
    User.findOne({
      _id: req.user.sub,
      academyId: req.academyId,
      active: true
    }).select('name email')
  ]);

  if (!user?.email) {
    return res.status(400).json({
      message: 'حسابك لا يحتوي على بريد إلكتروني صالح للاختبار'
    });
  }

  const info = mailer.configStatus();

  if (!info.configured) {
    return res.status(409).json({
      message: 'إعدادات Resend غير مكتملة',
      missing: info.missing
    });
  }

  try {
    const result = await mailer.sendTestEmail({
      to: user.email,
      academyName: academy?.name || 'AcademyFlow'
    });

    res.json({
      ok: true,
      provider: 'resend',
      to: user.email,
      messageId: result?.messageId || ''
    });
  } catch (err) {
    console.error('[resend test]', err.message);

    res.status(502).json({
      message: 'فشل إرسال البريد التجريبي عبر Resend',
      error: String(err.message || 'Resend error').slice(0,500),
      code: String(err.code || '').slice(0,120)
    });
  }
}

module.exports = { status, test };
