const mongoose = require('mongoose');
const Academy = require('../models/Academy');
const SystemError = require('../models/SystemError');
const SystemAlert = require('../models/SystemAlert');
const backupService = require('./backup.service');
const mailer = require('./mailer.service');
const externalBackup = require('./external-backup.service');

let timer = null;
let running = false;

function enabled() {
  return process.env.MONITORING_ENABLED !== 'false';
}

function numberEnv(name, fallback, min, max) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

function intervalMs() {
  return numberEnv('MONITOR_INTERVAL_MINUTES', 15, 5, 1440) * 60 * 1000;
}

function cooldownMs() {
  return numberEnv('ALERT_COOLDOWN_MINUTES', 360, 15, 10080) * 60 * 1000;
}

function alertRecipient() {
  return String(
    process.env.ALERT_EMAIL ||
    process.env.SUPERADMIN_EMAIL ||
    ''
  ).trim().toLowerCase();
}

async function collectIssues() {
  const issues = [];
  const now = Date.now();

  if (mongoose.connection.readyState !== 1) {
    issues.push({
      key: 'database.disconnected',
      severity: 'critical',
      title: 'MongoDB غير متصل',
      message: 'AcademyFlow لا يملك اتصالاً فعالاً بقاعدة البيانات.',
      details: { readyState: mongoose.connection.readyState }
    });
  } else {
    try {
      const started = Date.now();
      await mongoose.connection.db.command({ ping: 1 });
      const pingMs = Date.now() - started;
      const slowMs = numberEnv('DB_PING_ALERT_MS', 1000, 100, 30000);

      if (pingMs >= slowMs) {
        issues.push({
          key: 'database.slow',
          severity: 'warning',
          title: 'استجابة MongoDB بطيئة',
          message: `زمن Ping وصل إلى ${pingMs} ms.`,
          details: { pingMs, thresholdMs: slowMs }
        });
      }
    } catch (err) {
      issues.push({
        key: 'database.ping_failed',
        severity: 'critical',
        title: 'فشل فحص MongoDB',
        message: String(err.message || 'MongoDB ping failed').slice(0, 1000)
      });
    }
  }

  const [backups, storage, errorCount, brokenZoom, externalStorage] = await Promise.all([
    backupService.listBackups().catch(() => []),
    backupService.storageStatus(),
    SystemError.countDocuments({
      createdAt: {
        $gte: new Date(now - numberEnv('ERROR_ALERT_WINDOW_MINUTES', 15, 5, 1440) * 60 * 1000)
      }
    }),
    Academy.countDocuments({
      'zoomIntegration.connected': true,
      $or: [
        { 'zoomIntegration.zoomUserId': { $in: ['', null] } },
        { 'zoomIntegration.tokensEncrypted': { $in: ['', null] } }
      ]
    }),
    externalBackup.healthCheck()
  ]);

  const staleHours = numberEnv('BACKUP_STALE_HOURS', 30, 2, 720);
  const latest = backups[0] || null;
  const latestAgeHours = latest?.createdAt
    ? (now - new Date(latest.createdAt).getTime()) / 3600000
    : null;

  if (!latest) {
    issues.push({
      key: 'backup.missing',
      severity: 'critical',
      title: 'لا توجد نسخة احتياطية',
      message: 'لم يتم العثور على أي Backup صالح حتى الآن.'
    });
  } else if (latestAgeHours > staleHours) {
    issues.push({
      key: 'backup.stale',
      severity: 'critical',
      title: 'النسخة الاحتياطية متأخرة',
      message: `آخر Backup أقدم من ${staleHours} ساعة.`,
      details: {
        latestBackupId: latest.id,
        latestAgeHours: Math.round(latestAgeHours * 10) / 10
      }
    });
  }

  if (!storage.writable) {
    issues.push({
      key: 'storage.not_writable',
      severity: 'critical',
      title: 'تخزين النسخ غير قابل للكتابة',
      message: storage.error || 'BACKUP_DIR غير قابل للكتابة.'
    });
  }

  if (storage.freeBytes && storage.totalBytes) {
    const freePercent = (storage.freeBytes / storage.totalBytes) * 100;
    const threshold = numberEnv('STORAGE_FREE_PERCENT_ALERT', 15, 2, 50);

    if (freePercent <= threshold) {
      issues.push({
        key: 'storage.low_space',
        severity: freePercent <= 5 ? 'critical' : 'warning',
        title: 'مساحة Backup منخفضة',
        message: `المساحة الحرة المتبقية ${freePercent.toFixed(1)}% فقط.`,
        details: {
          freePercent: Math.round(freePercent * 10) / 10,
          thresholdPercent: threshold
        }
      });
    }
  }

  const errorThreshold = numberEnv('ERROR_ALERT_THRESHOLD', 5, 1, 1000);
  if (errorCount >= errorThreshold) {
    issues.push({
      key: 'server.errors_spike',
      severity: errorCount >= errorThreshold * 2 ? 'critical' : 'warning',
      title: 'ارتفاع أخطاء السيرفر',
      message: `تم تسجيل ${errorCount} خطأ HTTP 500+ خلال نافذة المراقبة.`,
      details: { errorCount, threshold: errorThreshold }
    });
  }

  if (brokenZoom > 0) {
    issues.push({
      key: 'zoom.broken_integrations',
      severity: 'warning',
      title: 'تكاملات Zoom تحتاج إصلاح',
      message: `${brokenZoom} أكاديمية لديها ربط Zoom غير مكتمل.`,
      details: { brokenZoom }
    });
  }

  if (externalStorage.configured && !externalStorage.ok) {
    issues.push({
      key: 'backup.external_unavailable',
      severity: 'critical',
      title: 'التخزين الخارجي للنسخ غير متاح',
      message: externalStorage.reason || 'فشل الاتصال بمخزن النسخ الخارجي.'
    });
  }

  if (
    externalStorage.configured &&
    latest &&
    latest.external?.configured &&
    !latest.external?.uploaded
  ) {
    issues.push({
      key: 'backup.external_upload_failed',
      severity: 'critical',
      title: 'فشل رفع آخر Backup خارج Railway',
      message: latest.external?.error || 'آخر نسخة محلية لم تصل إلى التخزين الخارجي.',
      details: { latestBackupId: latest.id }
    });
  }

  if (!mailer.configured()) {
    issues.push({
      key: 'email.not_configured',
      severity: 'warning',
      title: 'SendGrid غير جاهز',
      message: 'لن تصل تنبيهات البريد حتى تكتمل إعدادات SendGrid.'
    });
  }

  return issues;
}

async function notify(alert) {
  const to = alertRecipient();
  if (!to || !mailer.configured()) return false;

  await mailer.sendSystemAlert({
    to,
    severity: alert.severity,
    title: alert.title,
    message: alert.message,
    details: alert.details || {}
  });

  return true;
}

async function reconcile(issues) {
  const now = new Date();
  const activeKeys = new Set(issues.map(item => item.key));
  const existing = await SystemAlert.find();

  for (const item of issues) {
    let alert = existing.find(row => row.key === item.key);

    if (!alert) {
      alert = await SystemAlert.create({
        ...item,
        active: true,
        firstSeenAt: now,
        lastSeenAt: now,
        occurrences: 1
      });
    } else {
      alert.active = true;
      alert.severity = item.severity;
      alert.title = item.title;
      alert.message = item.message;
      alert.details = item.details || {};
      alert.lastSeenAt = now;
      alert.resolvedAt = null;
      alert.occurrences = Number(alert.occurrences || 0) + 1;
    }

    const due =
      !alert.lastNotifiedAt ||
      now.getTime() - new Date(alert.lastNotifiedAt).getTime() >= cooldownMs();

    if (due) {
      try {
        if (await notify(alert)) {
          alert.lastNotifiedAt = now;
        }
      } catch (err) {
        console.error('[monitor alert email]', err.message);
      }
    }

    await alert.save();
  }

  for (const alert of existing) {
    if (alert.active && !activeKeys.has(alert.key)) {
      alert.active = false;
      alert.resolvedAt = now;
      await alert.save();
    }
  }
}

async function run() {
  if (!enabled() || running) return;
  running = true;

  try {
    const issues = await collectIssues();
    await reconcile(issues);
    return issues;
  } catch (err) {
    console.error('[monitor]', err.message);
    return [];
  } finally {
    running = false;
  }
}

function start() {
  if (!enabled() || timer) return;

  setTimeout(run, 60 * 1000).unref?.();
  timer = setInterval(run, intervalMs());
  timer.unref?.();

  console.log('[monitor] system monitoring enabled');
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  start,
  stop,
  run,
  collectIssues,
  enabled
};
