const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Academy = require('../models/Academy');
const User = require('../models/User');
const Plan = require('../models/Plan');
const AuditLog = require('../models/AuditLog');
const SystemSetting = require('../models/SystemSetting');

async function platformSettings() {
  return SystemSetting.findOneAndUpdate(
    { key: 'platform' },
    { $setOnInsert: { key: 'platform' } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

async function audit(req, action, targetType, targetId, targetLabel, details = {}) {
  try {
    await AuditLog.create({
      actorId: req.user?.sub || null,
      actorRole: req.user?.role || 'superadmin',
      action,
      targetType,
      targetId: targetId ? String(targetId) : '',
      targetLabel: targetLabel || '',
      details
    });
  } catch (err) {
    console.error('[audit]', err.message);
  }
}

async function stats(req, res) {
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [
    total,
    active,
    trial,
    grace,
    frozen,
    suspended,
    plansCount,
    expiringSoon
  ] = await Promise.all([
    Academy.countDocuments(),
    Academy.countDocuments({ status: 'active' }),
    Academy.countDocuments({ status: 'trial' }),
    Academy.countDocuments({ status: 'grace' }),
    Academy.countDocuments({ status: 'frozen' }),
    Academy.countDocuments({ status: 'suspended' }),
    Plan.countDocuments({ active: true }),
    Academy.countDocuments({
      subscriptionEndsAt: { $gte: now, $lte: in30Days },
      status: { $in: ['active','grace'] }
    })
  ]);

  res.json({ total, active, trial, grace, frozen, suspended, plansCount, expiringSoon });
}

async function listAcademies(req, res) {
  const rows = await Academy.find()
    .populate('planId', 'name code monthlyPrice yearlyPrice active')
    .sort({ createdAt: -1 });
  res.json(rows);
}

async function createAcademy(req, res) {
  const {
    name, nameEn, slug, ownerName, ownerEmail, ownerPhone,
    ownerPassword, planId, phone, email, city, country
  } = req.body;

  if (!name || !slug || !ownerName || !ownerEmail || !ownerPassword) {
    return res.status(400).json({ message: 'Required fields are missing' });
  }

  if (String(ownerPassword).length < 10) {
    return res.status(400).json({ message: 'Owner password must be at least 10 characters' });
  }

  const normalizedSlug = String(slug).trim().toLowerCase();
  const normalizedOwnerEmail = String(ownerEmail).trim().toLowerCase();

  if (await Academy.exists({ slug: normalizedSlug })) {
    return res.status(409).json({ message: 'Academy slug is already used' });
  }

  if (planId && !(await Plan.exists({ _id: planId }))) {
    return res.status(400).json({ message: 'Selected plan does not exist' });
  }

  const settings = await platformSettings();
  const trialDays = Number(settings.defaultTrialDays || 15);
  const graceDays = Number(settings.defaultGraceDays || 5);

  const count = await Academy.countDocuments();
  let code = null;

  for (let i = count + 1; i < count + 5000; i++) {
    const candidate = `AF-${String(i).padStart(4, '0')}`;
    if (!(await Academy.exists({ code: candidate }))) {
      code = candidate;
      break;
    }
  }

  if (!code) return res.status(500).json({ message: 'Could not generate academy code' });

  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
  const graceEndsAt = new Date(trialEndsAt.getTime() + graceDays * 24 * 60 * 60 * 1000);
  const passwordHash = await bcrypt.hash(String(ownerPassword), 12);

  const session = await mongoose.startSession();
  let academy;

  try {
    await session.withTransaction(async () => {
      [academy] = await Academy.create([{
        code,
        name: String(name).trim(),
        nameEn: String(nameEn || '').trim(),
        slug: normalizedSlug,
        planId: planId || null,
        phone: String(phone || '').trim(),
        email: String(email || '').trim().toLowerCase(),
        country: String(country || 'Oman').trim(),
        city: String(city || '').trim(),
        currency: settings.defaultCurrency || 'OMR',
        status: 'trial',
        trialEndsAt,
        graceEndsAt
      }], { session });

      await User.create([{
        academyId: academy._id,
        name: String(ownerName).trim(),
        email: normalizedOwnerEmail,
        phone: String(ownerPhone || '').trim(),
        passwordHash,
        role: 'owner',
        active: true
      }], { session });
    });
  } finally {
    await session.endSession();
  }

  await audit(req, 'academy.create', 'academy', academy._id, academy.name, {
    code: academy.code,
    planId: academy.planId || null
  });

  res.status(201).json(academy);
}

async function updateAcademy(req, res) {
  const academy = await Academy.findById(req.params.id);
  if (!academy) return res.status(404).json({ message: 'Academy not found' });

  const allowed = ['name','nameEn','phone','email','country','city','currency','timezone'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) academy[key] = String(req.body[key] ?? '').trim();
  }

  if (req.body.planId !== undefined) {
    if (req.body.planId && !(await Plan.exists({ _id: req.body.planId }))) {
      return res.status(400).json({ message: 'Selected plan does not exist' });
    }
    academy.planId = req.body.planId || null;
  }

  await academy.save();
  await audit(req, 'academy.update', 'academy', academy._id, academy.name, {
    fields: Object.keys(req.body || {})
  });

  res.json(await academy.populate('planId', 'name code monthlyPrice yearlyPrice active'));
}

async function updateStatus(req, res) {
  const allowed = ['trial','active','grace','frozen','suspended'];

  if (!allowed.includes(req.body.status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  const academy = await Academy.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status },
    { new: true }
  );

  if (!academy) return res.status(404).json({ message: 'Academy not found' });

  await audit(req, 'academy.status', 'academy', academy._id, academy.name, {
    status: academy.status
  });

  res.json(academy);
}

async function updateSubscription(req, res) {
  const { planId, subscriptionEndsAt, status } = req.body;
  const academy = await Academy.findById(req.params.id);
  if (!academy) return res.status(404).json({ message: 'Academy not found' });

  if (planId !== undefined) {
    if (planId && !(await Plan.exists({ _id: planId }))) {
      return res.status(400).json({ message: 'Selected plan does not exist' });
    }
    academy.planId = planId || null;
  }

  if (subscriptionEndsAt !== undefined) {
    const value = subscriptionEndsAt ? new Date(subscriptionEndsAt) : null;
    if (value && Number.isNaN(value.getTime())) {
      return res.status(400).json({ message: 'Invalid subscription end date' });
    }
    academy.subscriptionEndsAt = value;
  }

  if (status !== undefined) {
    const allowed = ['trial','active','grace','frozen','suspended'];
    if (!allowed.includes(status)) return res.status(400).json({ message: 'Invalid status' });
    academy.status = status;
  }

  await academy.save();
  await audit(req, 'academy.subscription', 'academy', academy._id, academy.name, {
    planId: academy.planId || null,
    subscriptionEndsAt: academy.subscriptionEndsAt || null,
    status: academy.status
  });

  res.json(await academy.populate('planId', 'name code monthlyPrice yearlyPrice active'));
}

async function listPlans(req, res) {
  const filter = req.query.all === '1' ? {} : { active: true };
  res.json(await Plan.find(filter).sort({ monthlyPrice: 1, createdAt: 1 }));
}

async function createPlan(req, res) {
  const { name, code, monthlyPrice, yearlyPrice, students, instructors, courses, branches, features, active } = req.body;
  if (!name || !code) return res.status(400).json({ message: 'Plan name and code are required' });

  const normalizedCode = String(code).trim().toUpperCase();
  if (await Plan.exists({ code: normalizedCode })) {
    return res.status(409).json({ message: 'Plan code is already used' });
  }

  const row = await Plan.create({
    name: String(name).trim(),
    code: normalizedCode,
    monthlyPrice: Number(monthlyPrice || 0),
    yearlyPrice: Number(yearlyPrice || 0),
    limits: {
      students: Number(students || 100),
      instructors: Number(instructors || 3),
      courses: Number(courses || 10),
      branches: Number(branches || 1)
    },
    features: Array.isArray(features)
      ? features.filter(Boolean).map(String)
      : String(features || '').split('\n').map(x => x.trim()).filter(Boolean),
    active: active === undefined ? true : Boolean(active)
  });

  await audit(req, 'plan.create', 'plan', row._id, row.name, { code: row.code });
  res.status(201).json(row);
}

async function updatePlan(req, res) {
  const row = await Plan.findById(req.params.id);
  if (!row) return res.status(404).json({ message: 'Plan not found' });

  const { name, monthlyPrice, yearlyPrice, students, instructors, courses, branches, features } = req.body;

  if (name !== undefined) row.name = String(name).trim();
  if (monthlyPrice !== undefined) row.monthlyPrice = Number(monthlyPrice || 0);
  if (yearlyPrice !== undefined) row.yearlyPrice = Number(yearlyPrice || 0);

  if (students !== undefined) row.limits.students = Number(students || 0);
  if (instructors !== undefined) row.limits.instructors = Number(instructors || 0);
  if (courses !== undefined) row.limits.courses = Number(courses || 0);
  if (branches !== undefined) row.limits.branches = Number(branches || 0);

  if (features !== undefined) {
    row.features = Array.isArray(features)
      ? features.filter(Boolean).map(String)
      : String(features || '').split('\n').map(x => x.trim()).filter(Boolean);
  }

  await row.save();
  await audit(req, 'plan.update', 'plan', row._id, row.name, { fields: Object.keys(req.body || {}) });
  res.json(row);
}

async function togglePlan(req, res) {
  const row = await Plan.findById(req.params.id);
  if (!row) return res.status(404).json({ message: 'Plan not found' });

  row.active = !row.active;
  await row.save();

  await audit(req, 'plan.toggle', 'plan', row._id, row.name, { active: row.active });
  res.json(row);
}

async function subscriptions(req, res) {
  const rows = await Academy.find()
    .select('code name status planId trialEndsAt graceEndsAt subscriptionEndsAt createdAt')
    .populate('planId', 'name code monthlyPrice yearlyPrice active')
    .sort({ subscriptionEndsAt: 1, createdAt: -1 });

  res.json(rows);
}

async function health(req, res) {
  const dbStateMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };

  const memory = process.memoryUsage();
  const [academies, users, plans, logs] = await Promise.all([
    Academy.countDocuments(),
    User.countDocuments(),
    Plan.countDocuments(),
    AuditLog.countDocuments()
  ]);

  res.json({
    ok: mongoose.connection.readyState === 1,
    checkedAt: new Date().toISOString(),
    database: {
      state: dbStateMap[mongoose.connection.readyState] || 'unknown',
      name: mongoose.connection.name || ''
    },
    server: {
      uptimeSeconds: Math.round(process.uptime()),
      node: process.version,
      memoryMb: {
        rss: Math.round(memory.rss / 1024 / 1024),
        heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memory.heapTotal / 1024 / 1024)
      }
    },
    configuration: {
      jwtConfigured: Boolean(process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 64),
      mongoConfigured: Boolean(process.env.MONGODB_URI),
      allowedOriginsConfigured: Boolean(process.env.ALLOWED_ORIGINS),
      superAdminConfigured: Boolean(process.env.SUPERADMIN_USERNAME && process.env.SUPERADMIN_PASSWORD),
      zoomConfigured: Boolean(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET),
      zoomWebhookConfigured: Boolean(process.env.ZOOM_WEBHOOK_SECRET_TOKEN),
      sendgridConfigured: Boolean(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL)
    },
    counts: { academies, users, plans, auditLogs: logs }
  });
}

async function listAudit(req, res) {
  const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 300);
  const rows = await AuditLog.find()
    .populate('actorId', 'name username email')
    .sort({ createdAt: -1 })
    .limit(limit);
  res.json(rows);
}

async function getSettings(req, res) {
  res.json(await platformSettings());
}

async function updateSettings(req, res) {
  const settings = await platformSettings();

  const textFields = ['platformName','defaultCurrency','supportEmail','supportPhone','announcement'];
  for (const key of textFields) {
    if (req.body[key] !== undefined) settings[key] = String(req.body[key] ?? '').trim();
  }

  if (req.body.defaultTrialDays !== undefined) settings.defaultTrialDays = Number(req.body.defaultTrialDays || 0);
  if (req.body.defaultGraceDays !== undefined) settings.defaultGraceDays = Number(req.body.defaultGraceDays || 0);
  if (req.body.maintenanceMode !== undefined) settings.maintenanceMode = Boolean(req.body.maintenanceMode);

  await settings.save();
  await audit(req, 'system.settings', 'system', settings._id, settings.platformName, {
    fields: Object.keys(req.body || {})
  });

  res.json(settings);
}

module.exports = {
  stats,
  listAcademies,
  createAcademy,
  updateAcademy,
  updateStatus,
  updateSubscription,
  listPlans,
  createPlan,
  updatePlan,
  togglePlan,
  subscriptions,
  health,
  listAudit,
  getSettings,
  updateSettings
};
