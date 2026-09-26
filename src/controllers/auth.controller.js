const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Academy = require('../models/Academy');
const { COOKIE_NAME } = require('../middleware/auth');

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
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_MS
  };
}

function sign(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      academyId: user.academyId ? user.academyId.toString() : null
    },
    process.env.JWT_SECRET,
    {
      expiresIn: '12h',
      algorithm: 'HS256'
    }
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
    academyCode: academy?.code || null,
    academyName: academy?.name || null
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
    }).select('+passwordHash +failedLoginAttempts +lockUntil');
  } else {
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
      return invalidCredentials(res);
    }

    user = await User.findOne({
      academyId: null,
      username,
      active: true,
      role: 'superadmin'
    }).select('+passwordHash +failedLoginAttempts +lockUntil');
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
  }).select('name email username role academyId');

  if (!user) {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return res.status(401).json({ message: 'Unauthorized' });
  }

  let academy = null;

  if (user.academyId) {
    academy = await Academy.findById(user.academyId).select('code name status');

    if (!academy || ['frozen','suspended'].includes(academy.status)) {
      res.clearCookie(COOKIE_NAME, { path: '/' });
      return res.status(403).json({ message: 'Account unavailable' });
    }
  }

  res.set({
    'Cache-Control': 'no-store',
    Pragma: 'no-cache'
  });

  res.json({ user: publicUser(user, academy) });
}

function logout(req, res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: 'strict',
    path: '/'
  });

  res.set({
    'Cache-Control': 'no-store',
    Pragma: 'no-cache'
  });

  res.json({ ok: true });
}

module.exports = { login, me, logout };
