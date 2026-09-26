function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function safeTimeZone(value) {
  const timeZone = String(value || 'Asia/Muscat').trim() || 'Asia/Muscat';

  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    throw badRequest('المنطقة الزمنية في إعدادات الأكاديمية غير صحيحة');
  }
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);

  const out = {};
  for (const part of parts) {
    if (part.type !== 'literal') out[part.type] = Number(part.value);
  }
  return out;
}

function zonedLocalToUtc(dateString, timeString, timeZone) {
  const [year, month, day] = String(dateString).split('-').map(Number);
  const [hour, minute, second = 0] = String(timeString).split(':').map(Number);

  if (
    ![year, month, day, hour, minute, second].every(Number.isFinite) ||
    year < 2000 || year > 2200 ||
    month < 1 || month > 12 ||
    day < 1 || day > 31 ||
    hour < 0 || hour > 23 ||
    minute < 0 || minute > 59 ||
    second < 0 || second > 59
  ) {
    throw badRequest('موعد المحاضرة غير صحيح');
  }

  const zone = safeTimeZone(timeZone);
  const wantedUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = wantedUtc;

  for (let i = 0; i < 4; i++) {
    const p = zonedParts(new Date(guess), zone);
    const representedUtc = Date.UTC(
      p.year,
      p.month - 1,
      p.day,
      p.hour,
      p.minute,
      p.second || 0
    );
    guess += wantedUtc - representedUtc;
  }

  const result = new Date(guess);

  if (Number.isNaN(result.getTime())) {
    throw badRequest('موعد المحاضرة غير صحيح');
  }

  return result;
}

function parseAcademyDateTime(value, timeZone) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw badRequest('موعد المحاضرة غير صحيح');
    return value;
  }

  const text = String(value || '').trim();
  if (!text) throw badRequest('موعد المحاضرة مطلوب');

  // Already an absolute timestamp: keep the exact instant.
  if (/Z$/i.test(text) || /[+-]\d{2}:\d{2}$/.test(text)) {
    const absolute = new Date(text);
    if (Number.isNaN(absolute.getTime())) throw badRequest('موعد المحاضرة غير صحيح');
    return absolute;
  }

  // datetime-local from the browser. Interpret it in the academy timezone,
  // never in Railway/server timezone and never in the device timezone.
  const match = text.match(
    /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})(?::(\d{2}))?$/
  );

  if (!match) throw badRequest('موعد المحاضرة غير صحيح');

  return zonedLocalToUtc(
    match[1],
    match[2] + (match[3] ? ':' + match[3] : ''),
    timeZone
  );
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatAcademyInput(value, timeZone) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const p = zonedParts(date, timeZone);

  return [
    p.year,
    '-',
    pad(p.month),
    '-',
    pad(p.day),
    'T',
    pad(p.hour),
    ':',
    pad(p.minute)
  ].join('');
}

function formatAcademyDisplay(value, timeZone) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('ar-OM', {
    timeZone: safeTimeZone(timeZone),
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

module.exports = {
  safeTimeZone,
  zonedLocalToUtc,
  parseAcademyDateTime,
  formatAcademyInput,
  formatAcademyDisplay
};
