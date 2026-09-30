async function academyFlowLogin(event, kind){
  event.preventDefault();

  const form = event.currentTarget || event.target;
  if (!form || form.dataset.submitting === '1') return;

  const button = form.querySelector('button[type="submit"]');
  const message = form.querySelector('#msg') || document.getElementById('msg');
  const originalText = button ? button.textContent : '';

  form.dataset.submitting = '1';
  form.setAttribute('aria-busy', 'true');

  if (message) {
    message.textContent = '';
    message.classList.remove('success');
  }

  if (button) {
    button.disabled = true;
    button.textContent = 'جاري التحقق...';
  }

  async function request(url, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try { return await fetch(url, { ...options, signal: controller.signal }); }
    catch (error) {
      if (error.name === 'AbortError') throw new Error('الاتصال أخذ وقت طويل، حاول مرة ثانية.');
      throw error;
    } finally { clearTimeout(timer); }
  }

  try {
    let csrfInput = form.querySelector('input[name="_csrf"]');

    if (!csrfInput || !csrfInput.value) {
      const csrfResponse = await request('/api/auth/csrf', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
      });
      const csrfData = await csrfResponse.json().catch(() => ({}));

      if (!csrfResponse.ok || !csrfData.csrfToken) {
        throw new Error('تعذّر تجهيز الدخول الآمن، حدّث الصفحة وحاول مرة ثانية.');
      }

      if (!csrfInput) {
        csrfInput = document.createElement('input');
        csrfInput.type = 'hidden';
        csrfInput.name = '_csrf';
        form.appendChild(csrfInput);
      }

      csrfInput.value = csrfData.csrfToken;
    }

    const body = Object.fromEntries(new FormData(form).entries());

    if (kind === 'superadmin') {
      delete body.academyCode;
      delete body.email;
    }

    const response = await request('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (data.code === 'MFA_REQUIRED' && !form.querySelector('[name="otp"]')) {
        const label = document.createElement('label');
        label.textContent = 'رمز تطبيق المصادقة';
        const input = document.createElement('input');
        input.name = 'otp'; input.inputMode = 'numeric'; input.autocomplete = 'one-time-code';
        input.pattern = '[0-9]{6}'; input.maxLength = 6; input.required = true;
        label.appendChild(input); form.insertBefore(label, button); input.focus();
      }
      if (response.status === 403 && csrfInput) csrfInput.value = '';
      if (message) {
        message.textContent = data.message || 'تعذر تسجيل الدخول';
      }
      return;
    }

    try {
      localStorage.removeItem('af_token');
      localStorage.setItem('af_user', JSON.stringify(data.user));
    } catch {}

    const verifyResponse = await request('/api/auth/me', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    });
    const verified = await verifyResponse.json().catch(() => ({}));

    if (!verifyResponse.ok || !verified.user) {
      try { localStorage.removeItem('af_user'); } catch {}
      throw new Error(
        verified.message ||
        'تم قبول بيانات الدخول لكن المتصفح لم يحتفظ بالجلسة. حدّث الصفحة وحاول مرة أخرى.'
      );
    }

    try { localStorage.setItem('af_user', JSON.stringify(verified.user)); } catch {}
    if (message) {
      message.classList.add('success');
      message.textContent = 'تم الدخول، بنفتح مساحتك الحين…';
    }

    if (verified.user.role === 'owner' && verified.user.legalAcceptanceRequired) {
      location.replace('/academy/legal-acceptance.html');
      return;
    }

    const destinations = {
      superadmin: '/superadmin/dashboard.html',
      student: '/student/dashboard.html',
      instructor: '/instructor/dashboard.html'
    };

    location.replace(destinations[verified.user.role] || '/academy/dashboard.html');
  } catch (error) {
    console.error('AcademyFlow login error:', error);
    if (message) {
      message.textContent = error?.message || 'تعذر الاتصال بالخادم، حاول مرة أخرى.';
    }
  } finally {
    form.dataset.submitting = '0';
    form.setAttribute('aria-busy', 'false');

    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

window.login = academyFlowLogin;

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('form[data-login-kind]').forEach(form => {
    if (form.dataset.loginBound === '1') return;

    form.dataset.loginBound = '1';
    if (!document.getElementById('forgotPassword')) {
      const link = document.createElement('a');
      link.href = '/account/forgot-password.html'; link.textContent = 'نسيت كلمة المرور؟';
      form.appendChild(link);
    }
    form.addEventListener('submit', event => {
      academyFlowLogin(event, form.dataset.loginKind || 'academy');
    });
  });
});

async function logoutSession(destination){
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'Accept': 'application/json'
      }
    });
  } catch {}

  localStorage.removeItem('af_token');
  localStorage.removeItem('af_user');
  location.replace(destination || '/academy/login.html');
}
