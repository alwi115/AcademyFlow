const jwt = require('jsonwebtoken');

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

function auth(req, res, next) {
  const value = req.headers.authorization || '';
  const bearer = value.startsWith('Bearer ') ? value.slice(7).trim() : null;
  const token = cookieValue(req, COOKIE_NAME) || bearer;

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256']
    });
    next();
  } catch {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.status(401).json({ message: 'Invalid or expired session' });
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
