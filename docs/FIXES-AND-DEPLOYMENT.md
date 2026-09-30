# AcademyFlow Corrections

The original ZIP is unchanged. This checkout omits the obsolete uppercase `Public/`
tree, which collided with the active `public/` tree on Windows.

## Corrected Behavior

- Signed, nonempty CSRF tokens protect browser API mutations. Explicit bearer-only
  API calls remain supported. All pages load the shared secure-fetch wrapper.
- Logout revokes the issued session; password changes, password recovery, and MFA
  configuration changes invalidate older sessions. Recovery tokens are hashed,
  expire after 30 minutes, are single-use, and do not bypass enabled MFA.
- Optional TOTP MFA uses OTPAuth. Secrets are encrypted using a key derived from
  JWT_SECRET. Keep JWT_SECRET secure and stable; rotating it invalidates sessions
  and requires an intentional MFA-secret migration/recovery procedure.
- Instructors cannot read private student notifications or other groups' messages.
- Graded assignments cannot be overwritten. Submission windows and field length
  validators are enforced.
- Subscription expiry is checked on login and every authenticated request. Plan
  quotas are serialized using MongoDB transactions, including role conversions.
  Existing academies without a plan remain unlimited until a plan is assigned.
  Limits count all existing resources, including inactive/archived ones.
- Maintenance mode blocks tenant mutations while retaining superadmin access,
  reads, and logout.
- Attendance submissions are idempotent per UTC calendar day/student/course/group.
  Zoom events are deduplicated and serialized per meeting; duplicate departures
  do not inflate attendance duration.
- Health checks return 503 when MongoDB is unavailable. API validation/duplicate
  errors return 400/409 instead of generic 500 responses.
- Shared scripts/styles replace 305 inline asset copies. The enhanced calendar
  was preserved in the canonical script and a calendar-only stylesheet.

## Backups and Disaster Recovery

MongoDB 5+ on a replica set/sharded cluster is required for consistent snapshot
sessions and atomic restores. Atlas supports these features; standalone mongod
is deliberately not accepted for restore or quota-controlled writes.

Snapshots have a bounded logical payload (BACKUP_MAX_BYTES, default 32 MiB).
For larger databases use managed/native database snapshots rather than increasing
this limit indiscriminately. Backup checksums, encryption, and decompression size
limits are enforced. Restores are transactional and roll back on insertion failure.
Indexes are prepared before any deletion; an incompatible index fails safely.
Every successful restore rotates a global session epoch outside the backup,
preventing old passwords/session revocation records from reviving old JWTs.

Configure the EXTERNAL_BACKUP_* variables for an independent S3-compatible bucket.
Set REQUIRE_EXTERNAL_BACKUP=true in production. The application uploads the
encrypted payload and metadata before reporting backup success. External objects
are not removed by local retention. Configure bucket lifecycle/object-lock policy
independently and keep the encryption key outside MongoDB.

To recover after complete database loss, connect to the replacement replica set:

```sh
node scripts/recover-external-backup.js BACKUP_ID --import-only
```

This imports and validates a backup without deleting application data. Then use
the superadmin restore operation during a controlled restore window. Set
ENABLE_PRODUCTION_RESTORE=true only for that window and disable it afterwards.

Restore locks intentionally fail closed if a process crashes. Before clearing a
document in `academyflow_operation_locks`, confirm all restore processes have
stopped. The same precaution applies to `academyflow_zoom_event_locks` and a stuck
processing Zoom receipt: confirm the handler stopped, then clear that receipt
and meeting lock before retrying the signed event. Never clear active locks.

## Existing Database Upgrade

Do not run database tests or automatic index synchronization against production.
Take a verified independent backup first. Review existing attendance records for
same-day duplicates and normalize dates before adding the new compound unique
index. Duplicate records must be reviewed/merged intentionally; this checkout
does not delete old records automatically.

The Course academyId/code index changes from sparse to partial. Replace the old
index during a controlled migration, retaining uniqueness for actual code strings.
Rebuild affected indexes and validate the upgrade against a copy of production.
New empty databases get the correct indexes automatically.
Use `node scripts/check-upgrade.js` for a read-only duplicate/index readiness
report before migration. Production startup waits for required model indexes;
conflicting legacy indexes/duplicate data fail startup instead of weakening checks.

Expired subscriptions may now block access that the old version allowed. Correct
real subscription/trial/grace dates before upgrading; expiry does not mutate or
silently extend billing records. Renewals remain an administrator-managed process.

## External Integrations

- SendGrid: configure SENDGRID_API_KEY and a verified SENDGRID_FROM_EMAIL. Recovery
  requires PUBLIC_URL. General email notifications use a durable delivery queue,
  retry at most three times, honor preferences, and are marked sent only on delivery
  acceptance. Provider acceptance is not proof of inbox arrival.
  Delivery is at-least-once: provider acceptance followed by a connection/process
  failure can require a retry. Pause external sending during a restore window and
  review pending delivery records afterwards; restoring MongoDB cannot undo a
  message already sent by an external provider.
- WhatsApp: configure the Cloud API token, phone number ID, supported API version,
  and an approved template whose body has two text parameters (title/message).
  Explicit account preference opt-in is required. No unconfigured provider is
  reported as successfully sent.
- Stripe: configure the test secret key and signed webhook secret, PUBLIC_URL,
  PAYMENTS_ENABLED=true, and supported currencies. Register `/api/webhooks/stripe`
  for Checkout completion, async success/failure, and expiration. Students can pay
  their own pending payment records only; amounts come from the server and are
  confirmed by a signed webhook, never by the browser redirect. No automatic
  currency conversion is performed. OMR is not enabled by default. This is course
  payment checkout, not automatic academy subscription renewal. Refund processing
  remains an administrative/provider-side operation.
  Confirm that Stripe supports your merchant entity's country before enabling it:
  https://stripe.com/global . This implementation does not create a merchant account
  or assert that an Oman-based entity can accept Stripe payments.
  The configured gateway belongs to one platform merchant. Per-academy merchant
  onboarding and split settlements (Stripe Connect) are not implemented; validate
  the intended collection model before enabling real transactions.

No real external account was provisioned or charged, and no provider credentials
were supplied. Validate sending, delivery retries, checkout, and disaster recovery
with your own sandbox accounts before enabling production integrations.

## Verification and Local Demo

```sh
npm ci --ignore-scripts
npm run test:syntax
npm test
npm run demo
```

The test runner starts a temporary local MongoDB replica set and uses a separate
database per suite. Direct destructive scripts require NODE_ENV=test,
ALLOW_TEST_DB_RESET=true, a localhost URI, and an academyflow_*test* database name.
Production environments, remote hosts, credentials in the URI, and ordinary
database names are rejected before connecting.
Temporary binaries/screenshots default to the operating system temporary directory.
Set ACADEMYFLOW_WORK_DIR to use a dedicated workspace cache instead.

The demo uses a temporary local database, binds only to 127.0.0.1, disables external
integrations, and prints its URL and demo-only credentials. Data disappears when
the demo stops. It does not load production credentials from .env.
