const bcrypt = require('bcryptjs');
const Academy = require('../models/Academy');
const User = require('../models/User');
const Plan = require('../models/Plan');

async function stats(req, res) {
  const [total, active, trial, frozen] = await Promise.all([
    Academy.countDocuments(),
    Academy.countDocuments({ status: 'active' }),
    Academy.countDocuments({ status: 'trial' }),
    Academy.countDocuments({ status: 'frozen' })
  ]);
  res.json({ total, active, trial, frozen });
}

async function listAcademies(req, res) {
  const rows = await Academy.find().populate('planId', 'name code').sort({ createdAt: -1 });
  res.json(rows);
}

async function createAcademy(req, res) {
  const { name, nameEn, slug, ownerName, ownerEmail, ownerPhone, ownerPassword, planId, phone, email, city } = req.body;
  if (!name || !slug || !ownerName || !ownerEmail || !ownerPassword) return res.status(400).json({ message: 'Required fields are missing' });

  const count = await Academy.countDocuments();
  let code;
  for (let i = count + 1; i < count + 1000; i++) {
    code = `AF-${String(i).padStart(4, '0')}`;
    if (!(await Academy.exists({ code }))) break;
  }
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
  const graceEndsAt = new Date(trialEndsAt.getTime() + 5 * 24 * 60 * 60 * 1000);

  const academy = await Academy.create({ code, name, nameEn, slug, planId: planId || null, phone, email, city, status: 'trial', trialEndsAt, graceEndsAt });
  const passwordHash = await bcrypt.hash(ownerPassword, 12);
  await User.create({ academyId: academy._id, name: ownerName, email: ownerEmail, phone: ownerPhone, passwordHash, role: 'owner' });
  res.status(201).json(academy);
}

async function updateStatus(req, res) {
  const allowed = ['trial','active','grace','frozen','suspended'];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ message: 'Invalid status' });
  const academy = await Academy.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
  if (!academy) return res.status(404).json({ message: 'Academy not found' });
  res.json(academy);
}

async function plans(req, res) {
  res.json(await Plan.find({ active: true }).sort({ monthlyPrice: 1 }));
}

module.exports = { stats, listAcademies, createAcademy, updateStatus, plans };
