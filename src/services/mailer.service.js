const RESEND_API_URL = 'https://api.resend.com/emails';
const TEST_FROM = 'AcademyFlow <onboarding@resend.dev>';

const PUBLIC_MAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'me.com',
  'aol.com'
]);

function extractEmail(value) {
  const text = String(value || '').trim();
  const angle = text.match(/<([^<>\s]+@[^<>\s]+)>/);
  if (angle) return angle[1].toLowerCase();

  const plain = text.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  return plain ? text.toLowerCase() : '';
}

function senderDomain(value) {
  const email = extractEmail(value);
  return email.includes('@') ? email.split('@').pop() : '';
}

function isPlaceholderOrPublicSender(value) {
  const domain = senderDomain(value);
  if (!domain) return true;

  return (
    domain === 'yourdomain.com' ||
    domain.endsWith('.yourdomain.com') ||
    PUBLIC_MAIL_DOMAINS.has(domain)
  );
}

function resolveSender() {
  const rawFrom = String(
    process.env.RESEND_FROM ||
    process.env.EMAIL_FROM ||
    ''
  ).trim();

  if (!rawFrom) {
    return {
      rawFrom: '',
      from: TEST_FROM,
      mode: 'testing',
      ignoredConfiguredFrom: false,
      reason: 'لم يتم تحديد مرسل موثّق، لذلك يستخدم النظام مرسل Resend التجريبي.'
    };
  }

  const domain = senderDomain(rawFrom);

  if (
    rawFrom.toLowerCase().includes('onboarding@resend.dev') ||
    domain === 'resend.dev'
  ) {
    return {
      rawFrom,
      from: TEST_FROM,
      mode: 'testing',
      ignoredConfiguredFrom: false,
      reason: 'النظام يعمل بوضع اختبار Resend.'
    };
  }

  if (isPlaceholderOrPublicSender(rawFrom)) {
    return {
      rawFrom,
      from: TEST_FROM,
      mode: 'testing',
      ignoredConfiguredFrom: true,
      reason: 'تم تجاهل EMAIL_FROM لأنه غير صالح كمرسل موثّق في Resend، واستخدام onboarding@resend.dev تلقائيًا.'
    };
  }

  return {
    rawFrom,
    from: rawFrom,
    mode: 'production',
    ignoredConfiguredFrom: false,
    reason: 'مرسل مخصص جاهز. يجب أن يكون الدومين موثّقًا داخل Resend.'
  };
}

function configStatus() {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const testTo = String(process.env.RESEND_TEST_TO || '').trim();
  const sender = resolveSender();

  return {
    provider: 'resend',
    configured: Boolean(apiKey),
    apiKeyPresent: Boolean(apiKey),
    missing: apiKey ? [] : ['RESEND_API_KEY'],
    mode: sender.mode,
    from: sender.from,
    rawFrom: sender.rawFrom,
    ignoredConfiguredFrom: sender.ignoredConfiguredFrom,
    reason: sender.reason,
    testTo,
    testReady: Boolean(apiKey && testTo),
    productionReady: Boolean(apiKey && sender.mode === 'production')
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
  const email = String(recipient || '').trim().toLowerCase();

  if (!status.apiKeyPresent) {
    return {
      allowed: false,
      code: 'RESEND_NOT_CONFIGURED',
      reason: 'RESEND_API_KEY غير موجود.'
    };
  }

  if (!email) {
    return {
      allowed: false,
      code: 'RECIPIENT_MISSING',
      reason: 'البريد المستلم غير موجود.'
    };
  }

  if (status.mode === 'production') {
    return { allowed: true, code: 'OK', reason: '' };
  }

  const testTo = status.testTo.toLowerCase();

  if (!testTo) {
    return {
      allowed: false,
      code: 'RESEND_TEST_RECIPIENT_MISSING',
      reason: 'وضع الاختبار مفعل لكن RESEND_TEST_TO غير موجود.'
    };
  }

  if (email !== testTo) {
    return {
      allowed: false,
      code: 'RESEND_TEST_MODE_ONLY',
      reason: 'Resend بوضع الاختبار يسمح بالإرسال فقط إلى RESEND_TEST_TO حتى يتم توثيق دومين.'
    };
  }

  return { allowed: true, code: 'OK_TEST', reason: '' };
}

async function resendRequest(payload) {
  const status = configStatus();

  if (!status.apiKeyPresent) {
    const err = new Error('RESEND_API_KEY غير موجود');
    err.code = 'RESEND_NOT_CONFIGURED';
    err.missing = ['RESEND_API_KEY'];
    throw err;
  }

  const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];

  for (const recipient of recipients) {
    const capability = canSendTo(recipient);
    if (!capability.allowed) {
      const err = new Error(capability.reason);
      err.code = capability.code;
      throw err;
    }
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
        <p>إذا وصلت لك هذه الرسالة، فإعداد Resend يعمل.</p>
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
  canSendTo,
  sendTestEmail,
  sendLiveReminder
};
