const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Academy = require('../models/Academy');

const COOKIE_NAME = 'af_session';

function cookieValue(req, name) {
  const raw = req.headers.cookie || '';
  if (!raw) return null;

  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;

    const key = part.slice(0, index).trim();
    if (key !== name) continue;

    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return part.slice(index + 1).trim();
    }
  }

  return null;
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

async function auth(req, res, next) {
  const value = req.headers.authorization || '';
  const bearer = value.startsWith('Bearer ') ? value.slice(7).trim() : null;
  const token = cookieValue(req, COOKIE_NAME) || bearer;

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  let payload;

  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256']
    });
  } catch {
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
    }).select('_id role academyId active');

    if (!user) {
      clearSessionCookie(res);
      return res.status(401).json({ message: 'Session account is no longer active' });
    }

    if (user.role === 'superadmin') {
      if (user.academyId) {
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

    if (!user.academyId) {
      clearSessionCookie(res);
      return res.status(403).json({ message: 'Academy context missing' });
    }

    const academy = await Academy.findById(user.academyId).select('_id status');

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
      academyId: String(user.academyId)
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
