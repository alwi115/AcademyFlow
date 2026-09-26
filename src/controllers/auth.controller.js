const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Academy = require('../models/Academy');
const { COOKIE_NAME } = require('../middleware/auth');
const { CURRENT_LEGAL_VERSION } = require('../config/legal');
const auditService = require('../services/audit.service');

const SESSION_MS = 12 * 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

function isSecureCookie() {
  return process.env.NODE_ENV === 'production' ||
    Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_ID);
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MS
  };
}

function clearLegacySessionCookies(res) {
  for (const path of ['/', '/api', '/api/auth', '/academy', '/student', '/instructor', '/superadmin', '/owner']) {
    res.clearCookie(COOKIE_NAME, { path });
  }
}

function sign(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      academyId: user.academyId ? user.academyId.toString() : null,
      branchId: user.branchId ? user.branchId.toString() : null
    },
    process.env.JWT_SECRET,
    {
      expiresIn: '12h',
      algorithm: 'HS256'
    }
  );
}

function legalAcceptanceRequired(user) {
  if (user.role !== 'owner') return false;

  const legal = user.legalAcceptance || {};
  return !(
    legal.termsVersion === CURRENT_LEGAL_VERSION &&
    legal.privacyVersion === CURRENT_LEGAL_VERSION &&
    legal.dpaVersion === CURRENT_LEGAL_VERSION &&
    legal.acceptedAt
  );
}

function publicUser(user, academy = null) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    username: user.username || null,
    role: user.role,
    academyId: user.academyId,
    branchId: user.branchId || null,
    academyCode: academy?.code || null,
    academyName: academy?.name || null,
    legalAcceptanceRequired: legalAcceptanceRequired(user),
    legalVersion: CURRENT_LEGAL_VERSION
  };
}

function invalidCredentials(res) {
  return res.status(401).json({
    message: 'بيانات تسجيل الدخول غير صحيحة'
  });
}

async function registerFailure(user) {
  if (!user) return;

  const attempts = Number(user.failedLoginAttempts || 0) + 1;

  if (attempts >= MAX_FAILED_ATTEMPTS) {
    user.failedLoginAttempts = 0;
    user.lockUntil = new Date(Date.now() + LOCK_MS);
  } else {
    user.failedLoginAttempts = attempts;
  }

  await user.save();
}

async function login(req, res) {
  const academyCode = String(req.body.academyCode || '').trim().toUpperCase();
  const email = String(req.body.email || '').trim().toLowerCase();
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!password || password.length > 128) {
    return invalidCredentials(res);
  }

  let user = null;
  let academy = null;

  if (academyCode) {
    if (!/^[A-Z0-9-]{3,32}$/.test(academyCode) || !email || email.length > 254) {
      return invalidCredentials(res);
    }

    academy = await Academy.findOne({ code: academyCode });

    if (!academy) {
      return invalidCredentials(res);
    }

    if (['frozen','suspended'].includes(academy.status)) {
      return res.status(403).json({
        message: 'هذا الحساب غير متاح حاليًا. تواصل مع إدارة المنصة.'
      });
    }

    user = await User.findOne({
      academyId: academy._id,
      email,
      active: true,
      role: { $ne: 'superadmin' }
    }).select('+passwordHash +failedLoginAttempts +lockUntil legalAcceptance');
  } else {
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
      return invalidCredentials(res);
    }

    user = await User.findOne({
      academyId: null,
      username,
      active: true,
      role: 'superadmin'
    }).select('+passwordHash +failedLoginAttempts +lockUntil legalAcceptance');
  }

  if (user?.lockUntil && user.lockUntil.getTime() > Date.now()) {
    return res.status(429).json({
      message: 'تم إيقاف محاولات الدخول مؤقتًا. حاول بعد عدة دقائق.'
    });
  }

  if (user?.lockUntil && user.lockUntil.getTime() <= Date.now()) {
    user.lockUntil = null;
    user.failedLoginAttempts = 0;
  }

  const matches = user
    ? await bcrypt.compare(password, user.passwordHash)
    : false;

  if (!user || !matches) {
    await registerFailure(user);
    return invalidCredentials(res);
  }

  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  user.lastLoginAt = new Date();
  await user.save();

  clearLegacySessionCookies(res);
  res.cookie(COOKIE_NAME, sign(user), cookieOptions());

  res.set({
    'Cache-Control': 'no-store',
    Pragma: 'no-cache'
  });

  res.json({
    user: publicUser(user, academy)
  });
}

async function me(req, res) {
  const user = await User.findOne({
    _id: req.user.sub,
    active: true
  }).select('name email username role academyId branchId legalAcceptance');

  if (!user) {
    clearLegacySessionCookies(res);
    return res.status(401).json({ message: 'Unauthorized' });
  }

  let academy = null;

  if (user.academyId) {
    academy = await Academy.findById(user.academyId).select('code name status');

    if (!academy || ['frozen','suspended'].includes(academy.status)) {
      clearLegacySessionCookies(res);
      return res.status(403).json({ message: 'Account unavailable' });
    }
  }

  res.set({
    'Cache-Control': 'no-store',
    Pragma: 'no-cache'
  });

  res.json({ user: publicUser(user, academy) });
}

async function acceptLegal(req, res) {
  const user = await User.findOne({
    _id: req.user.sub,
    active: true,
    role: 'owner'
  });

  if (!user) {
    return res.status(403).json({ message: 'Only academy owners can accept platform terms.' });
  }

  const accepted = req.body?.accepted === true;
  const termsVersion = String(req.body?.termsVersion || '');
  const privacyVersion = String(req.body?.privacyVersion || '');
  const dpaVersion = String(req.body?.dpaVersion || '');

  if (
    !accepted ||
    termsVersion !== CURRENT_LEGAL_VERSION ||
    privacyVersion !== CURRENT_LEGAL_VERSION ||
    dpaVersion !== CURRENT_LEGAL_VERSION
  ) {
    return res.status(400).json({ message: 'يجب قبول الإصدارات القانونية الحالية كاملة.' });
  }

  user.legalAcceptance = {
    termsVersion: CURRENT_LEGAL_VERSION,
    privacyVersion: CURRENT_LEGAL_VERSION,
    dpaVersion: CURRENT_LEGAL_VERSION,
    acceptedAt: new Date(),
    acceptedIp: String(req.ip || '').replace(/^::ffff:/, '').slice(0, 100),
    acceptedUserAgent: String(req.get('user-agent') || '').slice(0, 500)
  };

  await user.save();

  await auditService.record(req, {
    action: 'legal.accept',
    targetType: 'legal',
    targetId: String(user._id),
    targetLabel: CURRENT_LEGAL_VERSION,
    details: {
      termsVersion: CURRENT_LEGAL_VERSION,
      privacyVersion: CURRENT_LEGAL_VERSION,
      dpaVersion: CURRENT_LEGAL_VERSION
    },
    statusCode: 200
  });

  res.json({
    ok: true,
    legalVersion: CURRENT_LEGAL_VERSION,
    acceptedAt: user.legalAcceptance.acceptedAt
  });
}

function logout(req, res) {
  clearLegacySessionCookies(res);

  res.set({
    'Cache-Control': 'no-store',
    Pragma: 'no-cache'
  });

  res.json({ ok: true });
}

module.exports = { login, me, acceptLegal, logout };
