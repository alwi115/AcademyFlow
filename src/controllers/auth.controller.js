const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Academy = require('../models/Academy');

function sign(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role, academyId: user.academyId ? user.academyId.toString() : null }, process.env.JWT_SECRET, { expiresIn: '12h' });
}

async function login(req, res) {
  const { academyCode, email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

  let academyId = null;
  if (academyCode) {
    const academy = await Academy.findOne({ code: academyCode.trim().toUpperCase() });
    if (!academy) return res.status(404).json({ message: 'Academy not found' });
    if (['frozen','suspended'].includes(academy.status)) return res.status(403).json({ message: 'Academy account is unavailable' });
    academyId = academy._id;
  }

  const user = await User.findOne({ academyId, email: email.toLowerCase(), active: true });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ message: 'Invalid credentials' });
  user.lastLoginAt = new Date();
  await user.save();
  res.json({ token: sign(user), user: { id: user._id, name: user.name, role: user.role, academyId: user.academyId } });
}

module.exports = { login };
