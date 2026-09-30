require('dotenv').config();
const mongoose = require('mongoose');
async function main() {
  const id = process.argv[2];
  if (!id || !process.argv.includes('--import-only')) throw new Error('Usage: node scripts/recover-external-backup.js BACKUP_ID --import-only');
  await mongoose.connect(process.env.MONGODB_URI);
  try { console.log(await require('../src/services/backup.service').importExternalBackup(id)); }
  finally { await mongoose.disconnect(); }
}
main().catch(err => { console.error(err.message); process.exitCode = 1; });
