const Academy = require('../models/Academy');
const User = require('../models/User');
const mailer = require('../services/mailer.service');

async function status(req, res) {
  // This endpoint must stay instant. Never open an SMTP connection while
  // loading the academy settings page.
  const info = mailer.configStatus();

  res.json({
    configured: info.configured,
    missing: info.missing,
    host: info.host || '',
    port: info.port,
    secure: info.secure,
    fromEmail: info.fromEmail || ''
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
      message: 'إعدادات SMTP غير مكتملة',
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
      to: user.email,
      messageId: result?.messageId || ''
    });
  } catch (err) {
    console.error('[smtp test]', err.message);

    res.status(502).json({
      message: 'فشل إرسال البريد التجريبي',
      error: String(err.message || 'SMTP error').slice(0,500),
      code: String(err.code || '').slice(0,80)
    });
  }
}

module.exports = { status, test };
