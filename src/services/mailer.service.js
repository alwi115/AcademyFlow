const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send';

function validEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function configStatus() {
  const apiKey = String(process.env.SENDGRID_API_KEY || '').trim();
  const fromEmail = validEmail(process.env.SENDGRID_FROM_EMAIL);
  const fromName = String(process.env.SENDGRID_FROM_NAME || 'AcademyFlow').trim() || 'AcademyFlow';
  const replyTo = validEmail(process.env.SENDGRID_REPLY_TO) || fromEmail;
  const missing = [];

  if (!apiKey) missing.push('SENDGRID_API_KEY');
  if (!fromEmail) missing.push('SENDGRID_FROM_EMAIL');

  return {
    provider: 'sendgrid',
    configured: missing.length === 0,
    missing,
    apiKeyPresent: Boolean(apiKey),
    fromEmail,
    fromName,
    replyTo
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

function canSendTo(recipient) {
  const status = configStatus();
  const email = validEmail(recipient);

  if (!status.apiKeyPresent) {
    return {
      allowed: false,
      code: 'SENDGRID_NOT_CONFIGURED',
      reason: 'SENDGRID_API_KEY غير موجود.'
    };
  }

  if (!status.fromEmail) {
    return {
      allowed: false,
      code: 'SENDGRID_FROM_MISSING',
      reason: 'SENDGRID_FROM_EMAIL غير موجود أو غير صحيح.'
    };
  }

  if (!email) {
    return {
      allowed: false,
      code: 'RECIPIENT_INVALID',
      reason: 'بريد المستلم غير صحيح.'
    };
  }

  return { allowed: true, code: 'OK', reason: '', email };
}

function errorMessageFromSendGrid(data, status) {
  if (Array.isArray(data?.errors) && data.errors.length) {
    return data.errors
      .map(item => item?.message)
      .filter(Boolean)
      .join(' · ')
      .slice(0,1000);
  }

  return String(data?.message || `SendGrid request failed (${status})`).slice(0,1000);
}

async function sendGridRequest({ to, subject, text, html }) {
  const status = configStatus();

  if (!status.configured) {
    const err = new Error('إعدادات SendGrid غير مكتملة');
    err.code = 'SENDGRID_NOT_CONFIGURED';
    err.missing = status.missing;
    err.retriable = false;
    throw err;
  }

  const capability = canSendTo(to);
  if (!capability.allowed) {
    const err = new Error(capability.reason);
    err.code = capability.code;
    err.retriable = false;
    throw err;
  }

  const payload = {
    personalizations: [
      {
        to: [{ email: capability.email }]
      }
    ],
    from: {
      email: status.fromEmail,
      name: status.fromName
    },
    subject,
    content: [
      { type: 'text/plain', value: String(text || '') },
      { type: 'text/html', value: String(html || '') }
    ]
  };

  if (status.replyTo) {
    payload.reply_to = {
      email: status.replyTo,
      name: status.fromName
    };
  }

  const response = await fetch(SENDGRID_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (response.ok) {
    return {
      ok: true,
      messageId: response.headers.get('x-message-id') || ''
    };
  }

  const data = await response.json().catch(() => ({}));
  const err = new Error(errorMessageFromSendGrid(data,response.status));
  err.status = response.status;
  err.code =
    response.status === 401 ? 'SENDGRID_UNAUTHORIZED' :
    response.status === 403 ? 'SENDGRID_FORBIDDEN' :
    response.status === 429 ? 'SENDGRID_RATE_LIMITED' :
    `SENDGRID_HTTP_${response.status}`;
  err.retriable = response.status === 429 || response.status >= 500;
  err.details = data;
  throw err;
}

async function sendTestEmail({ to, academyName }) {
  const base = appBaseUrl();

  return sendGridRequest({
    to,
    subject: 'AcademyFlow · اختبار البريد الإلكتروني',
    text: [
      'البريد يعمل بنجاح.',
      'هذه رسالة اختبار من AcademyFlow عبر SendGrid.',
      base ? `رابط النظام: ${base}` : ''
    ].filter(Boolean).join('\n'),
    html: `
      <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;color:#111827">
        <h2>البريد يعمل بنجاح ✅</h2>
        <p>هذه رسالة اختبار من <strong>${escapeHtml(academyName || 'AcademyFlow')}</strong> عبر SendGrid.</p>
        <p>إذا وصلت لك هذه الرسالة، فإعداد SendGrid جاهز لإرسال تذكيرات الطلاب.</p>
        ${base ? `<p><a href="${escapeHtml(base)}">فتح AcademyFlow</a></p>` : ''}
      </div>
    `
  });
}

async function sendSystemAlert({ to, severity, title, message, details = {} }) {
  const severityLabel = {
    info: 'معلومة',
    warning: 'تحذير',
    critical: 'حرج'
  }[severity] || 'تنبيه';

  const detailLines = Object.entries(details || {})
    .filter(([,value]) => value !== undefined && value !== null && value !== '')
    .slice(0, 12)
    .map(([key,value]) => `${key}: ${String(value)}`);

  return sendGridRequest({
    to,
    subject: `AcademyFlow · ${severityLabel}: ${title}`,
    text: [
      `الحالة: ${severityLabel}`,
      `العنوان: ${title}`,
      '',
      String(message || ''),
      detailLines.length ? '' : null,
      ...detailLines,
      '',
      'افتح مركز صحة النظام لمراجعة التفاصيل.'
    ].filter(Boolean).join('\n'),
    html: `
      <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;color:#111827">
        <h2 style="margin:0 0 12px">${escapeHtml(title)}</h2>
        <p><strong>الحالة:</strong> ${escapeHtml(severityLabel)}</p>
        <p>${escapeHtml(message)}</p>
        ${detailLines.length ? `
          <pre style="background:#f8fafc;border:1px solid #e2e8f0;padding:12px;border-radius:8px;white-space:pre-wrap">${escapeHtml(detailLines.join('\n'))}</pre>
        ` : ''}
        <p style="color:#64748b">راجع مركز صحة AcademyFlow لمعرفة الحالة الحالية.</p>
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

  return sendGridRequest({
    to,
    subject: `تذكير: ${session.title} تبدأ بعد ${minutes} دقائق`,
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
  canSendTo,
  sendTestEmail,
  sendLiveReminder,
  sendSystemAlert
};
