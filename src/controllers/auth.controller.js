const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Academy = require('../models/Academy');

function sign(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      academyId: user.academyId ? user.academyId.toString() : null
    },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
}

async function login(req, res) {
  const { academyCode, email, username, password } = req.body;

  if (!password) {
    return res.status(400).json({ message: 'Password is required' });
  }

  let user;
  let academy = null;

  if (academyCode) {
    if (!email) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    academy = await Academy.findOne({
      code: academyCode.trim().toUpperCase()
    });

    if (!academy) {
      return res.status(404).json({ message: 'Academy not found' });
    }

    if (['frozen', 'suspended'].includes(academy.status)) {
      return res.status(403).json({ message: 'Academy account is unavailable' });
    }

    user = await User.findOne({
      academyId: academy._id,
      email: email.trim().toLowerCase(),
      active: true,
      role: { $ne: 'superadmin' }
    }).select('+passwordHash');
  } else {
    if (!username) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    user = await User.findOne({
      academyId: null,
      username: username.trim().toLowerCase(),
      active: true,
      role: 'superadmin'
    }).select('+passwordHash');
  }

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  user.lastLoginAt = new Date();
  await user.save();

  res.json({
    token: sign(user),
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      username: user.username || null,
      role: user.role,
      academyId: user.academyId,
      academyCode: academy?.code || null,
      academyName: academy?.name || null
    }
  });
}

module.exports = { login };
