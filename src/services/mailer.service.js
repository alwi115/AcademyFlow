const nodemailer = require('nodemailer');

let transporter = null;

const REQUIRED_SMTP_VARS = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS'
];

function configStatus() {
  const missing = REQUIRED_SMTP_VARS.filter(key => !String(process.env[key] || '').trim());

  if (!String(process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || '').trim()) {
    missing.push('SMTP_FROM_EMAIL');
  }

  return {
    configured: missing.length === 0,
    missing,
    host: String(process.env.SMTP_HOST || '').trim(),
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    fromName: String(process.env.SMTP_FROM_NAME || 'AcademyFlow').trim(),
    fromEmail: String(process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || '').trim()
  };
}

function configured() {
  return configStatus().configured;
}

function getTransporter() {
  if (!configured()) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 15000,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  return transporter;
}

function appBaseUrl() {
  const explicit = String(process.env.PUBLIC_URL || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const firstOrigin = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)[0];

  return (firstOrigin || '').replace(/\/$/, '');
}

async function verifyConnection() {
  const status = configStatus();

  if (!status.configured) {
    return {
      ok: false,
      configured: false,
      missing: status.missing,
      error: 'SMTP is not configured'
    };
  }

  try {
    const tx = getTransporter();
    await tx.verify();

    return {
      ok: true,
      configured: true,
      missing: [],
      host: status.host,
      port: status.port,
      secure: status.secure,
      fromEmail: status.fromEmail
    };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      missing: [],
      host: status.host,
      port: status.port,
      secure: status.secure,
      fromEmail: status.fromEmail,
      error: String(err.message || 'SMTP connection failed').slice(0,500),
      code: String(err.code || '').slice(0,80)
    };
  }
}

async function sendTestEmail({ to, academyName }) {
  const tx = getTransporter();

  if (!tx) {
    const err = new Error('SMTP is not configured');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }

  const base = appBaseUrl();
  const subject = 'AcademyFlow · اختبار البريد الإلكتروني';
  const text = [
    'تم الاتصال بخدمة البريد بنجاح.',
    'هذه رسالة اختبار من AcademyFlow.',
    base ? `رابط النظام: ${base}` : ''
  ].filter(Boolean).join('\n');

  return tx.sendMail({
    from: {
      name: process.env.SMTP_FROM_NAME || academyName || 'AcademyFlow',
      address: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER
    },
    to,
    subject,
    text,
    html: `
      <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;color:#111827">
        <h2>البريد يعمل بنجاح ✅</h2>
        <p>هذه رسالة اختبار من <strong>AcademyFlow</strong>.</p>
        <p>إذا وصلت لك هذه الرسالة، فإعدادات SMTP صحيحة ويمكن للنظام إرسال تذكيرات المحاضرات.</p>
        ${base ? `<p><a href="${escapeHtml(base)}">فتح AcademyFlow</a></p>` : ''}
      </div>
    `
  });
}

async function sendLiveReminder({ to, studentName, academyName, session, minutes }) {
  const tx = getTransporter();
  if (!tx) {
    const err = new Error('SMTP is not configured');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }

  const base = appBaseUrl();
  const liveUrl = base ? base + '/student/live.html' : '';
  const startText = new Date(session.startAt).toLocaleString('ar-OM', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: session.timezone || 'Asia/Muscat'
  });

  const subject = `تذكير: ${session.title} تبدأ بعد ${minutes} دقائق`;

  const text = [
    `مرحبًا ${studentName || 'طالبنا'},`,
    '',
    `تذكير بأن المحاضرة "${session.title}" تبدأ بعد ${minutes} دقائق.`,
    `الموعد: ${startText}`,
    liveUrl ? `الدخول من AcademyFlow: ${liveUrl}` : '',
    '',
    `— ${academyName || 'AcademyFlow'}`
  ].filter(Boolean).join('\n');

  const html = `
    <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;color:#111827">
      <h2 style="margin:0 0 12px">${escapeHtml(session.title)}</h2>
      <p>مرحبًا <strong>${escapeHtml(studentName || 'طالبنا')}</strong>،</p>
      <p>تذكير بأن المحاضرة تبدأ بعد <strong>${Number(minutes)} دقائق</strong>.</p>
      <p><strong>الموعد:</strong> ${escapeHtml(startText)}</p>
      ${liveUrl ? `<p><a href="${escapeHtml(liveUrl)}" style="display:inline-block;padding:10px 16px;background:#0f766e;color:#fff;text-decoration:none;border-radius:8px">الدخول إلى المحاضرة</a></p>` : ''}
      <p style="color:#64748b">يفضل الدخول من AcademyFlow حتى يتم تسجيل الحضور تلقائيًا.</p>
      <p>— ${escapeHtml(academyName || 'AcademyFlow')}</p>
    </div>
  `;

  return tx.sendMail({
    from: {
      name: process.env.SMTP_FROM_NAME || academyName || 'AcademyFlow',
      address: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER
    },
    to,
    subject,
    text,
    html
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

module.exports = {
  configured,
  configStatus,
  verifyConnection,
  sendTestEmail,
  sendLiveReminder
};
