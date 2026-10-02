const assert = require('assert');
const {
  safeTimeZone,
  parseAcademyDateTime,
  formatAcademyInput,
  zonedLocalToUtc
} = require('../src/services/timezone.service');

function run() {
  const zone = safeTimeZone('Asia/Muscat');
  assert.strictEqual(zone, 'Asia/Muscat');

  const local = parseAcademyDateTime('2026-10-01T10:00', zone);
  assert.strictEqual(
    local.toISOString(),
    '2026-10-01T06:00:00.000Z',
    '10:00 in Muscat must be stored as 06:00 UTC'
  );

  assert.strictEqual(
    formatAcademyInput(local, zone),
    '2026-10-01T10:00',
    'UTC value must round-trip back to the academy local clock'
  );

  const recurring = zonedLocalToUtc('2026-10-01', '10:00', zone);
  assert.strictEqual(
    recurring.toISOString(),
    '2026-10-01T06:00:00.000Z',
    'Recurring sessions must use the same conversion'
  );

  const absolute = parseAcademyDateTime('2026-10-01T06:00:00.000Z', zone);
  assert.strictEqual(
    absolute.toISOString(),
    '2026-10-01T06:00:00.000Z',
    'Absolute timestamps must never be shifted twice'
  );

  assert.throws(
    () => safeTimeZone('Not/A-Timezone'),
    /المنطقة الزمنية/,
    'Invalid academy timezones must be rejected'
  );

  console.log('Timezone tests passed');
}

run();
