const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Academy = require('../models/Academy');
const User = require('../models/User');
const Plan = require('../models/Plan');
const AuditLog = require('../models/AuditLog');
const SystemSetting = require('../models/SystemSetting');
const SystemError = require('../models/SystemError');
const SystemAlert = require('../models/SystemAlert');
const PrivacyRequest = require('../models/PrivacyRequest');
const backupService = require('../services/backup.service');
const mailer = require('../services/mailer.service');
const bootstrapSuperAdmin = require('../services/superadmin-bootstrap.service');
const systemMonitor = require('../services/system-monitor.service');
const auditService = require('../services/audit.service');
const { objectId } = require('../utils/security-input');

async function platformSettings() {
  return SystemSetting.findOneAndUpdate(
    { key: 'platform' },
    { $setOnInsert: { key: 'platform' } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

async function audit(req, action, targetType, targetId, targetLabel, details = {}, before = null, after = null) {
  return auditService.record(req, {
    action,
    targetType,
    targetId,
    targetLabel,
    details,
    before,
    after,
    statusCode: 200,
    source: 'controller'
  });
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

  const safePlanId = planId ? objectId(String(planId), 'معرف الخطة غير صحيح') : null;
  if (safePlanId && !(await Plan.exists({ _id: safePlanId }))) {
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
        planId: safePlanId,
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
  const academyId = objectId(req.params.id, 'معرف الأكاديمية غير صحيح');
  const academy = await Academy.findById(academyId);
  if (!academy) return res.status(404).json({ message: 'Academy not found' });

  const allowed = ['name','nameEn','phone','email','country','city','currency','timezone'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) academy[key] = String(req.body[key] ?? '').trim();
  }

  if (req.body.planId !== undefined) {
    const safePlanId = req.body.planId
      ? objectId(String(req.body.planId), 'معرف الخطة غير صحيح')
      : null;
    if (safePlanId && !(await Plan.exists({ _id: safePlanId }))) {
      return res.status(400).json({ message: 'Selected plan does not exist' });
    }
    academy.planId = safePlanId;
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

  const academyId = objectId(req.params.id, 'معرف الأكاديمية غير صحيح');
  const academy = await Academy.findById(academyId);
  if (!academy) return res.status(404).json({ message: 'Academy not found' });

  const before = { status: academy.status };
  academy.status = req.body.status;
  await academy.save();

  await audit(
    req,
    'academy.status',
    'academy',
    academy._id,
    academy.name,
    { changedFields: ['status'] },
    before,
    { status: academy.status }
  );

  res.json(academy);
}

async function updateSubscription(req, res) {
  const { planId, subscriptionEndsAt, status } = req.body;
  const academyId = objectId(req.params.id, 'معرف الأكاديمية غير صحيح');
  const academy = await Academy.findById(academyId);
  if (!academy) return res.status(404).json({ message: 'Academy not found' });

  const before = {
    planId: academy.planId || null,
    subscriptionEndsAt: academy.subscriptionEndsAt || null,
    status: academy.status
  };

  if (planId !== undefined) {
    const safePlanId = planId ? objectId(String(planId), 'معرف الخطة غير صحيح') : null;
    if (safePlanId && !(await Plan.exists({ _id: safePlanId }))) {
      return res.status(400).json({ message: 'Selected plan does not exist' });
    }
    academy.planId = safePlanId;
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
  await audit(
    req,
    'academy.subscription',
    'academy',
    academy._id,
    academy.name,
    { changedFields: Object.keys(req.body || {}) },
    before,
    {
      planId: academy.planId || null,
      subscriptionEndsAt: academy.subscriptionEndsAt || null,
      status: academy.status
    }
  );

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

  const before = {
    name: row.name,
    monthlyPrice: row.monthlyPrice,
    yearlyPrice: row.yearlyPrice,
    limits: row.limits?.toObject ? row.limits.toObject() : row.limits,
    features: row.features,
    active: row.active
  };

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
  await audit(
    req,
    'plan.update',
    'plan',
    row._id,
    row.name,
    { fields: Object.keys(req.body || {}) },
    before,
    {
      name: row.name,
      monthlyPrice: row.monthlyPrice,
      yearlyPrice: row.yearlyPrice,
      limits: row.limits?.toObject ? row.limits.toObject() : row.limits,
      features: row.features,
      active: row.active
    }
  );
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
  const now = new Date();
  const dbStarted = Date.now();

  let dbPingMs = null;
  let dbPingOk = false;

  try {
    await mongoose.connection.db.command({ ping: 1 });
    dbPingOk = true;
    dbPingMs = Date.now() - dbStarted;
  } catch {}

  const [
    academies,
    users,
    plans,
    logs,
    backups,
    storage,
    recentErrors,
    connectedZoomAcademies,
    brokenZoomAcademies,
    academyIssues,
    activeAlerts
  ] = await Promise.all([
    Academy.countDocuments(),
    User.countDocuments(),
    Plan.countDocuments(),
    AuditLog.countDocuments(),
    backupService.listBackups().catch(() => []),
    backupService.storageStatus(),
    SystemError.find()
      .populate('academyId', 'name code')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
    Academy.countDocuments({ 'zoomIntegration.connected': true }),
    Academy.countDocuments({
      'zoomIntegration.connected': true,
      $or: [
        { 'zoomIntegration.zoomUserId': { $in: ['', null] } },
        { 'zoomIntegration.tokensEncrypted': { $in: ['', null] } }
      ]
    }),
    Academy.find({
      $or: [
        { status: { $in: ['frozen','suspended'] } },
        {
          status: { $in: ['active','grace'] },
          subscriptionEndsAt: { $lt: now }
        },
        {
          'zoomIntegration.connected': true,
          $or: [
            { 'zoomIntegration.zoomUserId': { $in: ['', null] } },
            { 'zoomIntegration.tokensEncrypted': { $in: ['', null] } }
          ]
        }
      ]
    })
      .select('name code status subscriptionEndsAt zoomIntegration.connected zoomIntegration.accessTokenExpiresAt')
      .sort({ updatedAt: -1 })
      .limit(25)
      .lean(),
    SystemAlert.find({ active: true })
      .sort({ lastSeenAt: -1 })
      .limit(50)
      .lean()
  ]);

  const email = mailer.configStatus();
  const legalSettings = await platformSettings();
  const legalRequiredFields = {
    legalEntityName: Boolean(String(legalSettings.legalEntityName || '').trim()),
    commercialRegistrationNumber: Boolean(String(legalSettings.commercialRegistrationNumber || '').trim()),
    ecommerceLicenseNumber: Boolean(String(legalSettings.ecommerceLicenseNumber || '').trim()),
    businessAddress: Boolean(String(legalSettings.businessAddress || '').trim()),
    supportEmail: Boolean(String(legalSettings.supportEmail || '').trim()),
    supportPhone: Boolean(String(legalSettings.supportPhone || '').trim()),
    privacyOfficerName: Boolean(String(legalSettings.privacyOfficerName || '').trim()),
    privacyOfficerEmail: Boolean(String(legalSettings.privacyOfficerEmail || '').trim())
  };
  const legalMissing = Object.entries(legalRequiredFields)
    .filter(([, ready]) => !ready)
    .map(([key]) => key);
  const legalReadyCount = Object.values(legalRequiredFields).filter(Boolean).length;
  const legalReadinessPercent = Math.round(
    (legalReadyCount / Object.keys(legalRequiredFields).length) * 100
  );
  const legalComplete = legalMissing.length === 0;

  const latestBackup = backups[0] || null;
  const backupAgeHours = latestBackup?.createdAt
    ? Math.round(((Date.now() - new Date(latestBackup.createdAt).getTime()) / 3600000) * 10) / 10
    : null;

  const zoomOAuthConfigured = Boolean(
    process.env.ZOOM_CLIENT_ID &&
    process.env.ZOOM_CLIENT_SECRET &&
    process.env.ZOOM_REDIRECT_URI
  );

  const backupAutoEnabled =
    process.env.AUTO_BACKUP_ENABLED !== 'false' &&
    backupService.explicitStorageConfigured() &&
    (
      process.env.NODE_ENV !== 'production' ||
      backupService.encryptionConfigured()
    );

  const critical =
    !dbPingOk ||
    !storage.writable ||
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET.length < 64 ||
    activeAlerts.some(alert => alert.severity === 'critical');

  const degraded =
    !critical && (
      !storage.explicitlyConfigured ||
      !latestBackup ||
      !email.configured ||
      !zoomOAuthConfigured ||
      recentErrors.length > 0 ||
      academyIssues.length > 0 ||
      activeAlerts.length > 0 ||
      !legalComplete
    );

  res.json({
    ok: !critical,
    status: critical ? 'critical' : degraded ? 'degraded' : 'healthy',
    checkedAt: now.toISOString(),
    database: {
      state: dbStateMap[mongoose.connection.readyState] || 'unknown',
      name: mongoose.connection.name || '',
      pingOk: dbPingOk,
      pingMs: dbPingMs
    },
    server: {
      uptimeSeconds: Math.round(process.uptime()),
      node: process.version,
      environment: process.env.NODE_ENV || 'development',
      memoryMb: {
        rss: Math.round(memory.rss / 1024 / 1024),
        heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memory.heapTotal / 1024 / 1024)
      }
    },
    storage: {
      ...storage,
      freeMb: storage.freeBytes == null ? null : Math.round(storage.freeBytes / 1024 / 1024),
      totalMb: storage.totalBytes == null ? null : Math.round(storage.totalBytes / 1024 / 1024)
    },
    backups: {
      count: backups.length,
      latest: latestBackup,
      latestAgeHours: backupAgeHours,
      automaticEnabled: backupAutoEnabled,
      intervalHours: Number(process.env.BACKUP_INTERVAL_HOURS || 24),
      retentionCount: Number(process.env.BACKUP_RETENTION_COUNT || 5),
      busy: backupService.isBusy(),
      operation: backupService.operation(),
      productionRestoreEnabled:
        process.env.NODE_ENV !== 'production' ||
        process.env.ENABLE_PRODUCTION_RESTORE === 'true'
    },
    email: {
      provider: email.provider,
      configured: email.configured,
      missing: email.missing,
      fromEmailConfigured: Boolean(email.fromEmail)
    },
    zoom: {
      configured: zoomOAuthConfigured,
      webhookConfigured: Boolean(process.env.ZOOM_WEBHOOK_SECRET_TOKEN),
      tokenEncryptionKeyConfigured: Boolean(process.env.ZOOM_TOKEN_ENCRYPTION_KEY),
      connectedAcademies: connectedZoomAcademies,
      brokenIntegrations: brokenZoomAcademies
    },
    configuration: {
      jwtConfigured: Boolean(process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 64),
      mongoConfigured: Boolean(process.env.MONGODB_URI),
      allowedOriginsConfigured: Boolean(process.env.ALLOWED_ORIGINS),
      superAdminConfigured: Boolean(process.env.SUPERADMIN_USERNAME && process.env.SUPERADMIN_PASSWORD),
      zoomConfigured: zoomOAuthConfigured,
      zoomWebhookConfigured: Boolean(process.env.ZOOM_WEBHOOK_SECRET_TOKEN),
      zoomTokenEncryptionConfigured: Boolean(process.env.ZOOM_TOKEN_ENCRYPTION_KEY),
      sendgridConfigured: email.configured,
      backupDirectoryConfigured: storage.explicitlyConfigured,
      backupMongoConfigured:
        storage.provider === 'mongodb-gridfs' &&
        storage.explicitlyConfigured &&
        storage.writable,
      backupStorageProvider: storage.provider || 'mongodb-gridfs',
      backupEncryptionConfigured: storage.encryptionConfigured
    },
    counts: { academies, users, plans, auditLogs: logs },
    legalReadiness: {
      complete: legalComplete,
      percent: legalReadinessPercent,
      missing: legalMissing,
      fields: legalRequiredFields,
      policiesPublished: true,
      ownerAcceptanceEnforced: true,
      privacyRightsWorkflowEnabled: true,
      ecommerceLicenseConfigured: Boolean(String(legalSettings.ecommerceLicenseNumber || '').trim()),
      taxNumberConfigured: Boolean(String(legalSettings.taxNumber || '').trim())
    },
    monitoring: {
      enabled: systemMonitor.enabled(),
      intervalMinutes: Number(process.env.MONITOR_INTERVAL_MINUTES || 15),
      alertRecipientConfigured: Boolean(process.env.ALERT_EMAIL || process.env.SUPERADMIN_EMAIL),
      activeAlerts
    },
    recentErrors,
    academyIssues
  });
}

async function runHealthMonitor(req, res) {
  const issues = await systemMonitor.run();

  await audit(req, 'system.monitor.run', 'system', '', 'System monitor', {
    issueCount: issues?.length || 0
  });

  res.json({
    ok: true,
    issueCount: issues?.length || 0
  });
}

async function listBackups(req, res) {
  const [rows, storage] = await Promise.all([
    backupService.listBackups(),
    backupService.storageStatus()
  ]);

  res.json({
    rows,
    storage,
    automaticEnabled:
      process.env.AUTO_BACKUP_ENABLED !== 'false' &&
      backupService.explicitStorageConfigured() &&
      (
        process.env.NODE_ENV !== 'production' ||
        backupService.encryptionConfigured()
      ),
    productionRestoreEnabled:
      process.env.NODE_ENV !== 'production' ||
      process.env.ENABLE_PRODUCTION_RESTORE === 'true'
  });
}

async function createBackup(req, res) {
  const row = await backupService.createBackup({ reason: 'manual' });

  await audit(req, 'backup.create', 'backup', row.id, row.id, {
    sizeBytes: row.sizeBytes,
    documentCount: row.documentCount,
    collectionCount: row.collectionCount
  });

  res.status(201).json(row);
}

async function validateBackup(req, res) {
  const result = await backupService.validateBackup(req.params.id);

  await audit(req, 'backup.validate', 'backup', result.metadata.id, result.metadata.id, {
    sha256: result.metadata.sha256
  });

  res.json({
    ok: true,
    backup: result.metadata
  });
}

async function restoreBackup(req, res) {
  const expected = `RESTORE ${req.params.id}`;

  if (String(req.body?.confirmation || '') !== expected) {
    return res.status(400).json({
      message: `Confirmation must exactly match: ${expected}`
    });
  }

  const result = await backupService.restoreBackup(req.params.id);

  // Restore may bring back an older Super Admin record. Re-sync the environment
  // credential after the database write so the platform owner cannot be locked out.
  const superAdminRecovery = await bootstrapSuperAdmin({ resetPassword: true });

  await audit(req, 'backup.restore', 'backup', result.restored.id, result.restored.id, {
    safetyBackupId: result.safetyBackup.id,
    restoredCollections: result.restoredCollections,
    restoredDocuments: result.restoredDocuments,
    superAdminRecovery: superAdminRecovery.reason || 'ok'
  });

  res.json({
    ...result,
    superAdminRecovery
  });
}

async function listPrivacyRequests(req, res) {
  const filter = {};
  if (req.query.status) {
    filter.status = String(req.query.status);
  }

  const rows = await PrivacyRequest.find(filter)
    .populate('handledBy', 'name username email')
    .sort({ createdAt: -1 })
    .limit(300);

  res.json(rows);
}

async function updatePrivacyRequest(req, res) {
  const row = await PrivacyRequest.findById(req.params.id);
  if (!row) return res.status(404).json({ message: 'Privacy request not found' });

  const allowedStatuses = ['received','verifying','in_progress','completed','rejected'];

  if (req.body.status !== undefined) {
    const status = String(req.body.status);
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid privacy request status' });
    }
    row.status = status;
    row.completedAt = status === 'completed' ? new Date() : null;
  }

  if (req.body.identityVerified !== undefined) {
    row.identityVerified = Boolean(req.body.identityVerified);
  }

  if (req.body.internalNote !== undefined) {
    row.internalNote = String(req.body.internalNote || '').trim().slice(0, 4000);
  }

  row.handledBy = req.user.sub;
  await row.save();

  await audit(req, 'privacy.request.update', 'privacy_request', row._id, row.requestNumber, {
    status: row.status,
    identityVerified: row.identityVerified
  });

  res.json(await row.populate('handledBy', 'name username email'));
}

async function listAudit(req, res) {
  const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 300);
  const rows = await AuditLog.find()
    .populate('actorId', 'name username email')
    .populate('academyId', 'name code')
    .sort({ createdAt: -1 })
    .limit(limit);
  res.json(rows);
}

async function getSettings(req, res) {
  res.json(await platformSettings());
}

async function updateSettings(req, res) {
  const settings = await platformSettings();
  const before = settings.toObject();

  const textFields = [
    'platformName',
    'defaultCurrency',
    'supportEmail',
    'supportPhone',
    'legalEntityName',
    'commercialRegistrationNumber',
    'ecommerceLicenseNumber',
    'taxNumber',
    'businessAddress',
    'privacyOfficerName',
    'privacyOfficerEmail',
    'announcement'
  ];
  for (const key of textFields) {
    if (req.body[key] !== undefined) settings[key] = String(req.body[key] ?? '').trim();
  }

  if (req.body.defaultTrialDays !== undefined) settings.defaultTrialDays = Number(req.body.defaultTrialDays || 0);
  if (req.body.defaultGraceDays !== undefined) settings.defaultGraceDays = Number(req.body.defaultGraceDays || 0);
  if (req.body.maintenanceMode !== undefined) settings.maintenanceMode = Boolean(req.body.maintenanceMode);

  await settings.save();
  await audit(
    req,
    'system.settings',
    'system',
    settings._id,
    settings.platformName,
    { fields: Object.keys(req.body || {}) },
    before,
    settings.toObject()
  );

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
  runHealthMonitor,
  listBackups,
  createBackup,
  validateBackup,
  restoreBackup,
  listPrivacyRequests,
  updatePrivacyRequest,
  listAudit,
  getSettings,
  updateSettings
};
