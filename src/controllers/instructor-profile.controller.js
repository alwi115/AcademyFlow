const bcrypt = require('bcryptjs');
const Academy = require('../models/Academy');
const User = require('../models/User');

function clean(value) {
  return typeof value === 'string' ? value.trim() : value;
}

async function profile(req, res) {
  const [instructor, academy] = await Promise.all([
    User.findOne({
      _id: req.user.sub,
      academyId: req.academyId,
      role: 'instructor',
      active: true
    }).select('name email phone role lastLoginAt createdAt'),
    Academy.findById(req.academyId).select('code name logoUrl city country')
  ]);

  if (!instructor) {
    return res.status(404).json({ message: 'حساب المدرب غير موجود' });
  }

  res.json({ user: instructor, academy });
}

async function updateProfile(req, res) {
  const update = {};

  if (req.body.name !== undefined && clean(req.body.name)) {
    update.name = clean(req.body.name);
  }

  if (req.body.phone !== undefined) {
    update.phone = clean(req.body.phone);
  }

  const row = await User.findOneAndUpdate(
    {
      _id: req.user.sub,
      academyId: req.academyId,
      role: 'instructor'
    },
    { $set: update },
    { new: true, runValidators: true }
  ).select('name email phone role lastLoginAt createdAt');

  if (!row) {
    return res.status(404).json({ message: 'حساب المدرب غير موجود' });
  }

  res.json(row);
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      message: 'كلمة المرور الحالية والجديدة مطلوبة'
    });
  }

  if (String(newPassword).length < 10) {
    return res.status(400).json({
      message: 'كلمة المرور الجديدة يجب ألا تقل عن 10 أحرف'
    });
  }

  const row = await User.findOne({
    _id: req.user.sub,
    academyId: req.academyId,
    role: 'instructor',
    active: true
  }).select('+passwordHash');

  if (!row || !(await bcrypt.compare(currentPassword, row.passwordHash))) {
    return res.status(400).json({ message: 'كلمة المرور الحالية غير صحيحة' });
  }

  row.passwordHash = await bcrypt.hash(String(newPassword), 12);
  await row.save();

  res.json({ ok: true });
}

module.exports = {
  profile,
  updateProfile,
  changePassword
};
