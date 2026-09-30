const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
async function main() {
  const scripts = process.argv.slice(2);
  const targets = scripts.length ? scripts : ['learning-tools-test.js', 'security-regression-test.js', 'fixes-regression-test.js', 'mongodb-storage-test.js', 'tenant-isolation-test.js', 'rbac-test.js', 'backup-restore-test.js', 'monitoring-test.js', 'legal-readiness-test.js', 'e2e-test.js', 'performance-smoke-test.js'];
  const db = await MongoMemoryReplSet.create({ binary: { downloadDir: path.join(require('./work-directory'), 'mongodb-binaries') }, replSet: { count: 1, storageEngine: 'wiredTiger' } });
  let failed = false;
  try {
    for (const file of targets) {
      if (!/^[a-z0-9-]+-test\.js$/.test(file)) throw new Error('Invalid test script name');
      const code = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit', env: { ...process.env,
          NODE_ENV: 'test', ACADEMYFLOW_ISOLATED_DEMO: 'true', ALLOW_TEST_DB_RESET: 'true', MONGODB_URI: db.getUri('academyflow_' + file.replace(/[^a-z0-9]/g, '_')),
          JWT_SECRET: crypto.randomBytes(48).toString('hex'), BACKUP_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
          SENDGRID_API_KEY: '', STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', WHATSAPP_ACCESS_TOKEN: '',
          EXTERNAL_BACKUP_ACCESS_KEY_ID: '', EXTERNAL_BACKUP_SECRET_ACCESS_KEY: '', REQUIRE_EXTERNAL_BACKUP: 'false',
          GEMINI_API_KEY: '', OPENAI_API_KEY: '', ZOOM_CLIENT_SECRET: '', ZOOM_WEBHOOK_SECRET_TOKEN: '',
          PAYMENTS_ENABLED: 'false', AUTO_BACKUP_ENABLED: 'false', MONITORING_ENABLED: 'false' } });
        child.on('error', reject); child.on('exit', resolve);
      });
      if (code !== 0) { failed = true; console.error('FAILED:', file); }
    }
  } finally { await db.stop(); }
  if (failed) process.exitCode = 1;
}
main().catch(err => { console.error(err); process.exitCode = 1; });
