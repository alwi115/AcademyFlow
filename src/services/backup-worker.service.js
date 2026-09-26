const backups = require('./backup.service');

let timer = null;

function enabled() {
  if (process.env.AUTO_BACKUP_ENABLED === 'false') return false;
  return backups.explicitStorageConfigured();
}

function intervalMs() {
  const hours = Math.min(
    Math.max(Number(process.env.BACKUP_INTERVAL_HOURS || 24), 1),
    168
  );
  return hours * 60 * 60 * 1000;
}

async function run() {
  if (!enabled() || backups.isBusy()) return;

  try {
    const result = await backups.createBackup({ reason: 'automatic' });
    console.log('[backup] automatic backup created', result.id);
  } catch (err) {
    console.error('[backup] automatic backup failed', err.message);
  }
}

function start() {
  if (!enabled() || timer) return;

  const initialDelay = Math.min(5 * 60 * 1000, intervalMs());
  setTimeout(run, initialDelay).unref?.();

  timer = setInterval(run, intervalMs());
  timer.unref?.();

  console.log('[backup] automatic backups enabled');
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, enabled };
