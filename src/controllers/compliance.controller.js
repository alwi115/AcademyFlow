const crypto = require('crypto');
const ProcessingActivity = require('../models/ProcessingActivity');
const PrivacyIncident = require('../models/PrivacyIncident');
const compliance = require('../services/privacy-compliance.service');
const auditService = require('../services/audit.service');

function clean(value, max = 5000) {
  return String(value || '').trim().slice(0, max);
}

function stringList(value) {
  if (Array.isArray(value)) {
    return value.map(x => clean(x, 500)).filter(Boolean);
  }
  return clean(value, 5000)
    .split(/\r?\n|,/)
    .map(x => x.trim())
    .filter(Boolean)
    .slice(0, 100);
}

function incidentNumber() {
  const d = new Date();
  return 'INC-' +
    d.getUTCFullYear() +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0') +
    '-' +
    crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function listProcessingActivities(req, res) {
  await compliance.ensureBaseline();
  const rows = await ProcessingActivity.find({ active: true })
    .populate('reviewedBy', 'name username email')
    .sort({ name: 1 });
  res.json(rows);
}

async function reviewProcessingActivity(req, res) {
  const row = await ProcessingActivity.findById(req.params.id);
  if (!row) return res.status(404).json({ message: 'Processing activity not found' });

  row.lastReviewedAt = new Date();
  row.reviewedBy = req.user.sub;
  await row.save();

  await auditService.record(req, {
    action: 'privacy.processing_activity.review',
    targetType: 'processing_activity',
    targetId: row._id,
    targetLabel: row.name,
    details: { key: row.key },
    statusCode: 200
  });

  res.json(await row.populate('reviewedBy', 'name username email'));
}

async function listPrivacyIncidents(req, res) {
  const rows = await PrivacyIncident.find()
    .populate('createdBy updatedBy', 'name username email')
    .sort({ detectedAt: -1 })
    .limit(300);
  res.json(rows);
}

async function createPrivacyIncident(req, res) {
  const title = clean(req.body.title, 240);
  const description = clean(req.body.description, 5000);

  if (!title || !description) {
    return res.status(400).json({ message: 'Incident title and description are required' });
  }

  let number = incidentNumber();
  while (await PrivacyIncident.exists({ incidentNumber: number })) {
    number = incidentNumber();
  }

  const riskLevel = ['low','medium','high','critical'].includes(req.body.riskLevel)
    ? req.body.riskLevel
    : 'medium';

  const row = await PrivacyIncident.create({
    incidentNumber: number,
    title,
    detectedAt: req.body.detectedAt ? new Date(req.body.detectedAt) : new Date(),
    occurredAt: req.body.occurredAt ? new Date(req.body.occurredAt) : null,
    description,
    dataCategories: stringList(req.body.dataCategories),
    affectedSubjectsEstimate: Math.max(0, Number(req.body.affectedSubjectsEstimate || 0)),
    riskLevel,
    rightsRisk: Boolean(req.body.rightsRisk),
    highRiskToSubjects: Boolean(req.body.highRiskToSubjects),
    containmentActions: clean(req.body.containmentActions),
    correctiveActions: clean(req.body.correctiveActions),
    authorityNotificationRequired: Boolean(req.body.authorityNotificationRequired),
    subjectsNotificationRequired: Boolean(req.body.subjectsNotificationRequired),
    status: 'open',
    createdBy: req.user.sub,
    updatedBy: req.user.sub
  });

  await auditService.record(req, {
    action: 'privacy.incident.create',
    targetType: 'privacy_incident',
    targetId: row._id,
    targetLabel: row.incidentNumber,
    details: {
      riskLevel: row.riskLevel,
      rightsRisk: row.rightsRisk,
      highRiskToSubjects: row.highRiskToSubjects
    },
    statusCode: 201
  });

  res.status(201).json(row);
}

async function updatePrivacyIncident(req, res) {
  const row = await PrivacyIncident.findById(req.params.id);
  if (!row) return res.status(404).json({ message: 'Privacy incident not found' });

  const before = row.toObject();

  if (req.body.status !== undefined) {
    if (!['open','contained','closed'].includes(req.body.status)) {
      return res.status(400).json({ message: 'Invalid incident status' });
    }
    row.status = req.body.status;
  }

  if (req.body.riskLevel !== undefined) {
    if (!['low','medium','high','critical'].includes(req.body.riskLevel)) {
      return res.status(400).json({ message: 'Invalid risk level' });
    }
    row.riskLevel = req.body.riskLevel;
  }

  for (const key of ['rightsRisk','highRiskToSubjects','authorityNotificationRequired','subjectsNotificationRequired']) {
    if (req.body[key] !== undefined) row[key] = Boolean(req.body[key]);
  }

  for (const key of ['containmentActions','correctiveActions']) {
    if (req.body[key] !== undefined) row[key] = clean(req.body[key]);
  }

  if (req.body.authorityNotifiedAt !== undefined) {
    row.authorityNotifiedAt = req.body.authorityNotifiedAt ? new Date(req.body.authorityNotifiedAt) : null;
  }
  if (req.body.subjectsNotifiedAt !== undefined) {
    row.subjectsNotifiedAt = req.body.subjectsNotifiedAt ? new Date(req.body.subjectsNotifiedAt) : null;
  }

  row.updatedBy = req.user.sub;
  await row.save();

  await auditService.record(req, {
    action: 'privacy.incident.update',
    targetType: 'privacy_incident',
    targetId: row._id,
    targetLabel: row.incidentNumber,
    before: {
      status: before.status,
      riskLevel: before.riskLevel,
      rightsRisk: before.rightsRisk,
      highRiskToSubjects: before.highRiskToSubjects,
      authorityNotificationRequired: before.authorityNotificationRequired,
      authorityNotifiedAt: before.authorityNotifiedAt,
      subjectsNotificationRequired: before.subjectsNotificationRequired,
      subjectsNotifiedAt: before.subjectsNotifiedAt
    },
    after: {
      status: row.status,
      riskLevel: row.riskLevel,
      rightsRisk: row.rightsRisk,
      highRiskToSubjects: row.highRiskToSubjects,
      authorityNotificationRequired: row.authorityNotificationRequired,
      authorityNotifiedAt: row.authorityNotifiedAt,
      subjectsNotificationRequired: row.subjectsNotificationRequired,
      subjectsNotifiedAt: row.subjectsNotifiedAt
    },
    statusCode: 200
  });

  res.json(await row.populate('createdBy updatedBy', 'name username email'));
}

module.exports = {
  listProcessingActivities,
  reviewProcessingActivity,
  listPrivacyIncidents,
  createPrivacyIncident,
  updatePrivacyIncident
};
