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
    apiKeyPresent: Boolean(info.apiKeyPresent),
    testTo: info.testTo || '',
    testToConfigured: Boolean(info.testTo),
    mode: info.mode,
    testReady: Boolean(info.testReady),
    productionReady: Boolean(info.productionReady),
    ignoredConfiguredFrom: Boolean(info.ignoredConfiguredFrom),
    reason: info.reason || ''
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

  const info = mailer.configStatus();
  const recipient = String(info.testTo || user?.email || '').trim();

  if (!recipient) {
    return res.status(400).json({
      message: 'لا يوجد بريد مخصص للاختبار. أضف RESEND_TEST_TO في Railway.'
    });
  }

  if (!info.configured) {
    return res.status(409).json({
      message: 'إعدادات Resend غير مكتملة',
      missing: info.missing
    });
  }

  const capability = mailer.canSendTo(recipient);

  if (!capability.allowed) {
    return res.status(409).json({
      message: 'وضع اختبار Resend غير جاهز',
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
      provider: 'resend',
      mode: info.mode,
      from: info.from,
      to: recipient,
      messageId: result?.messageId || ''
    });
  } catch (err) {
    console.error('[resend test]', err.message);

    res.status(502).json({
      message: 'فشل إرسال البريد التجريبي عبر Resend',
      error: String(err.message || 'Resend error').slice(0,500),
      code: String(err.code || '').slice(0,120),
      to: recipient
    });
  }
}

module.exports = { status, test };
