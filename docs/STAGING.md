# AcademyFlow Staging

هذه البيئة مخصصة لتجربة أي تحديث قبل الإنتاج.

## قواعد إلزامية

1. استخدم خدمة Railway منفصلة أو Railway Environment منفصلة باسم `staging`.
2. استخدم قاعدة MongoDB مستقلة:
   - مثال: `academyflow_staging`
   - لا تستخدم قاعدة بيانات الإنتاج.
3. استخدم أسرارًا مختلفة عن الإنتاج:
   - `JWT_SECRET`
   - `BACKUP_ENCRYPTION_KEY`
   - `ZOOM_TOKEN_ENCRYPTION_KEY`
   - بيانات Super Admin
4. لا تربط Zoom الحقيقي أو SendGrid الحقيقي إلا عند اختبار التكامل عمدًا.
5. لا تستخدم رابط الإنتاج كـ `STAGING_BASE_URL`.

## متغيرات Staging الأساسية

```text
NODE_ENV=production
MONGODB_URI=<STAGING DATABASE ONLY>
JWT_SECRET=<NEW STAGING SECRET 64+ CHARS>
ALLOWED_ORIGINS=https://<staging-domain>
PUBLIC_URL=https://<staging-domain>

SUPERADMIN_USERNAME=<staging-admin>
SUPERADMIN_EMAIL=<staging-email>
SUPERADMIN_PASSWORD=<staging-password>

BACKUP_DIR=/data/backups
BACKUP_ENCRYPTION_KEY=<NEW STAGING KEY 32+ CHARS>
AUTO_BACKUP_ENABLED=true
BACKUP_INTERVAL_HOURS=24
BACKUP_RETENTION_COUNT=7
ENABLE_PRODUCTION_RESTORE=false

MONITORING_ENABLED=true
MONITOR_INTERVAL_MINUTES=15
ALERT_COOLDOWN_MINUTES=360
BACKUP_STALE_HOURS=30
ERROR_ALERT_WINDOW_MINUTES=15
ERROR_ALERT_THRESHOLD=5
STORAGE_FREE_PERCENT_ALERT=15
```

## GitHub

بعد إنشاء رابط Staging أضف Repository Variable باسم:

```text
STAGING_BASE_URL=https://<staging-domain>
```

ثم شغّل Workflow:

`AcademyFlow Staging Validation`

الـ workflow يرفض رابط الإنتاج `https://academyflow.up.railway.app` بشكل صريح، ويفحص:

- `/api/health`
- Security Headers
- OWASP ZAP baseline
- عدم وجود Medium/High DAST findings

## سياسة النشر

المسار المقترح لأي تحديث:

`GitHub main checks -> Staging deployment -> Staging Validation -> Production`

لا تستخدم Restore الخاص بالإنتاج في Staging إلا عند اختبار Disaster Recovery بشكل مقصود.
