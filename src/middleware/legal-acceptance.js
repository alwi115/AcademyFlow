const { CURRENT_LEGAL_VERSION } = require('../config/legal');

function requireOwnerLegalAcceptance(req, res, next) {
  if (req.user?.role !== 'owner') return next();

  const legal = req.user.legalAcceptance || {};
  const accepted =
    legal.termsVersion === CURRENT_LEGAL_VERSION &&
    legal.privacyVersion === CURRENT_LEGAL_VERSION &&
    legal.dpaVersion === CURRENT_LEGAL_VERSION &&
    Boolean(legal.acceptedAt);

  if (!accepted) {
    return res.status(428).json({
      message: 'يلزم قبول المستندات القانونية الحالية قبل متابعة استخدام لوحة الأكاديمية.',
      legalAcceptanceRequired: true,
      legalVersion: CURRENT_LEGAL_VERSION,
      redirect: '/academy/legal-acceptance.html'
    });
  }

  next();
}

module.exports = requireOwnerLegalAcceptance;
