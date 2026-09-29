# MongoDB-only persistent storage

AcademyFlow no longer requires a persistent application filesystem.

## What lives in MongoDB

- Application data: regular MongoDB collections.
- Certificate PDFs: MongoDB GridFS bucket `academyflow_certificates`.
- Encrypted logical backups: MongoDB GridFS bucket `academyflow_backups`.
- Backup metadata: collection `academyflow_backup_records`.

The backup bucket and backup metadata collection are intentionally excluded from
logical backup snapshots so a backup never recursively copies older backups.
Certificate GridFS collections are included, so certificate files are restored
together with the rest of AcademyFlow.

## Required environment variables

```env
MONGODB_URI=
BACKUP_ENCRYPTION_KEY=
AUTO_BACKUP_ENABLED=true
BACKUP_INTERVAL_HOURS=24
BACKUP_RETENTION_COUNT=5
```

No `BACKUP_DIR`, `CERTIFICATE_STORAGE_DIR`, Railway Volume, S3 bucket, or
other persistent filesystem is required by the current application.

## Legacy /data migration

If an old Railway volume becomes accessible again, mount it and run:

```bash
npm run migrate:storage
```

Defaults:

- certificates: `/data/certificates`
- backups: `/data/backups`

Optional overrides:

```env
LEGACY_CERTIFICATE_STORAGE_DIR=/data/certificates
LEGACY_BACKUP_DIR=/data/backups
DELETE_LEGACY_FILES_AFTER_MIGRATION=false
```

Keep deletion disabled for the first migration. Verify certificates and backups
from the AcademyFlow UI before intentionally deleting the old files.
