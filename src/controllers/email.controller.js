const Academy = require('../models/Academy');
const User = require('../models/User');
const mailer = require('../services/mailer.service');

async function status(req, res) {
  const info = mailer.configStatus();

  res.json({
    provider: info.provider,
    configured: info.configured,
    missing: info.missing,
    apiKeyPresent: Boolean(info.apiKeyPresent),
    fromEmail: info.fromEmail || '',
    fromName: info.fromName || 'AcademyFlow',
    replyTo: info.replyTo || ''
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

  const recipient = String(user?.email || '').trim();

  if (!recipient) {
    return res.status(400).json({
      message: 'حسابك لا يحتوي على بريد إلكتروني صالح للاختبار'
    });
  }

  const info = mailer.configStatus();

  if (!info.configured) {
    return res.status(409).json({
      message: 'إعدادات SendGrid غير مكتملة',
      missing: info.missing
    });
  }

  const capability = mailer.canSendTo(recipient);
  if (!capability.allowed) {
    return res.status(409).json({
      message: 'إعداد البريد غير جاهز',
      error: capability.reason,
      code: capability.code
    });
  }

  try {
    const result = await mailer.sendTestEmail({
      to: recipient,
      academyName: academy?.name || 'AcademyFlow'
    });

    res.json({
      ok: true,
      provider: 'sendgrid',
      from: info.fromEmail,
      to: recipient,
      messageId: result?.messageId || ''
    });
  } catch (err) {
    console.error('[sendgrid test]', err.message);

    res.status(502).json({
      message: 'فشل إرسال البريد التجريبي عبر SendGrid',
      error: String(err.message || 'SendGrid error').slice(0,1000),
      code: String(err.code || '').slice(0,120),
      to: recipient
    });
  }
}

module.exports = { status, test };
