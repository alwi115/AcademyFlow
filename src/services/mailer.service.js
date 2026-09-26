const RESEND_API_URL = 'https://api.resend.com/emails';

function configStatus() {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const from = String(process.env.EMAIL_FROM || '').trim();
  const missing = [];

  if (!apiKey) missing.push('RESEND_API_KEY');
  if (!from) missing.push('EMAIL_FROM');

  return {
    provider: 'resend',
    configured: missing.length === 0,
    missing,
    from,
    apiKeyPresent: Boolean(apiKey)
  };
}

function configured() {
  return configStatus().configured;
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

async function resendRequest(payload) {
  const status = configStatus();

  if (!status.configured) {
    const err = new Error('Resend is not configured');
    err.code = 'RESEND_NOT_CONFIGURED';
    err.missing = status.missing;
    throw err;
  }

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: status.from,
      ...payload
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(
      data.message ||
      data.error ||
      `Resend request failed (${response.status})`
    );
    err.code = data.name || data.code || `HTTP_${response.status}`;
    err.status = response.status;
    err.details = data;
    throw err;
  }

  return {
    id: data.id || '',
    messageId: data.id || '',
    raw: data
  };
}

async function sendTestEmail({ to, academyName }) {
  const base = appBaseUrl();

  return resendRequest({
    to: [to],
    subject: 'AcademyFlow · اختبار البريد الإلكتروني',
    text: [
      'البريد يعمل بنجاح.',
      'هذه رسالة اختبار من AcademyFlow عبر Resend.',
      base ? `رابط النظام: ${base}` : ''
    ].filter(Boolean).join('\n'),
    html: `
      <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;color:#111827">
        <h2>البريد يعمل بنجاح ✅</h2>
        <p>هذه رسالة اختبار من <strong>${escapeHtml(academyName || 'AcademyFlow')}</strong> عبر Resend.</p>
        <p>إذا وصلت لك هذه الرسالة، فإعداد البريد صحيح ويمكن للنظام إرسال تذكيرات المحاضرات.</p>
        ${base ? `<p><a href="${escapeHtml(base)}">فتح AcademyFlow</a></p>` : ''}
      </div>
    `
  });
}

async function sendLiveReminder({ to, studentName, academyName, session, minutes }) {
  const base = appBaseUrl();
  const liveUrl = base ? base + '/student/live.html' : '';

  const startText = new Date(session.startAt).toLocaleString('ar-OM', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: session.timezone || 'Asia/Muscat'
  });

  const subject = `تذكير: ${session.title} تبدأ بعد ${minutes} دقائق`;

  return resendRequest({
    to: [to],
    subject,
    text: [
      `مرحبًا ${studentName || 'طالبنا'},`,
      '',
      `تذكير بأن المحاضرة "${session.title}" تبدأ بعد ${minutes} دقائق.`,
      `الموعد: ${startText}`,
      liveUrl ? `الدخول من AcademyFlow: ${liveUrl}` : '',
      '',
      `— ${academyName || 'AcademyFlow'}`
    ].filter(Boolean).join('\n'),
    html: `
      <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;color:#111827">
        <h2 style="margin:0 0 12px">${escapeHtml(session.title)}</h2>
        <p>مرحبًا <strong>${escapeHtml(studentName || 'طالبنا')}</strong>،</p>
        <p>تذكير بأن المحاضرة تبدأ بعد <strong>${Number(minutes)} دقائق</strong>.</p>
        <p><strong>الموعد:</strong> ${escapeHtml(startText)}</p>
        ${liveUrl ? `<p><a href="${escapeHtml(liveUrl)}" style="display:inline-block;padding:10px 16px;background:#0f766e;color:#fff;text-decoration:none;border-radius:8px">الدخول إلى المحاضرة</a></p>` : ''}
        <p style="color:#64748b">يفضل الدخول من AcademyFlow حتى يتم تسجيل حضورك تلقائيًا.</p>
        <p>— ${escapeHtml(academyName || 'AcademyFlow')}</p>
      </div>
    `
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
  sendTestEmail,
  sendLiveReminder
};
