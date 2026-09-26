const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Academy = require('../models/Academy');

const COOKIE_NAME = 'af_session';

function cookieValues(req, name) {
  const raw = req.headers.cookie || '';
  if (!raw) return [];

  const values = [];

  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;

    const key = part.slice(0, index).trim();
    if (key !== name) continue;

    const rawValue = part.slice(index + 1).trim();
    try {
      values.push(decodeURIComponent(rawValue));
    } catch {
      values.push(rawValue);
    }
  }

  return values.filter(Boolean);
}

function clearSessionCookie(res) {
  for (const path of ['/', '/api', '/api/auth', '/academy', '/student', '/instructor', '/superadmin', '/owner']) {
    res.clearCookie(COOKIE_NAME, { path });
  }
}

async function auth(req, res, next) {
  const value = req.headers.authorization || '';
  const bearer = value.startsWith('Bearer ') ? value.slice(7).trim() : null;
  const candidates = [...cookieValues(req, COOKIE_NAME), bearer]
    .filter(Boolean);

  if (!candidates.length) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  let payload = null;

  for (const token of candidates) {
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ['HS256']
      });
      break;
    } catch {}
  }

  if (!payload) {
    clearSessionCookie(res);
    return res.status(401).json({ message: 'Invalid or expired session' });
  }

  try {
    // Never trust role or academyId stored in an older JWT. Resolve the
    // current account state from MongoDB on every protected request so role,
    // academy and active-status changes take effect immediately.
    const user = await User.findOne({
      _id: payload.sub,
      active: true
    }).select('_id role academyId branchId active legalAcceptance');

    if (!user) {
      clearSessionCookie(res);
      return res.status(401).json({ message: 'Session account is no longer active' });
    }

    const currentAcademyId = user.academyId ? String(user.academyId) : null;
    const tokenAcademyId = payload.academyId ? String(payload.academyId) : null;
    const currentBranchId = user.branchId ? String(user.branchId) : null;
    const tokenBranchId = payload.branchId ? String(payload.branchId) : null;

    // A role or tenant change is a security boundary change. Do not silently
    // upgrade, downgrade or move an existing session: force a fresh login.
    if (
      payload.role !== user.role ||
      tokenAcademyId !== currentAcademyId ||
      tokenBranchId !== currentBranchId
    ) {
      clearSessionCookie(res);
      return res.status(401).json({ message: 'Session scope changed. Sign in again.' });
    }

    if (user.role === 'superadmin') {
      if (currentAcademyId) {
        clearSessionCookie(res);
        return res.status(403).json({ message: 'Invalid superadmin account scope' });
      }

      req.user = {
        sub: String(user._id),
        role: user.role,
        academyId: null
      };

      return next();
    }

    if (!currentAcademyId) {
      clearSessionCookie(res);
      return res.status(403).json({ message: 'Academy context missing' });
    }

    if (user.role === 'branch_manager' && !currentBranchId) {
      clearSessionCookie(res);
      return res.status(403).json({ message: 'Branch manager is not assigned to a branch' });
    }

    const academy = await Academy.findById(currentAcademyId).select('_id status');

    if (!academy) {
      clearSessionCookie(res);
      return res.status(403).json({ message: 'Academy context is no longer valid' });
    }

    if (['frozen','suspended'].includes(academy.status)) {
      clearSessionCookie(res);
      return res.status(403).json({ message: 'Account unavailable' });
    }

    req.user = {
      sub: String(user._id),
      role: user.role,
      academyId: currentAcademyId,
      branchId: currentBranchId,
      legalAcceptance: user.legalAcceptance || null
    };

    return next();
  } catch (err) {
    return next(err);
  }
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}

module.exports = { auth, allowRoles, COOKIE_NAME };
