async function academyFlowLogin(event, kind){
  event.preventDefault();

  const form = event.currentTarget || event.target;
  if (!form || form.dataset.submitting === '1') return;

  const button = form.querySelector('button[type="submit"]');
  const message = form.querySelector('#msg') || document.getElementById('msg');
  const originalText = button ? button.textContent : '';

  form.dataset.submitting = '1';

  if (message) {
    message.textContent = '';
  }

  if (button) {
    button.disabled = true;
    button.textContent = 'جاري التحقق...';
  }

  try {
    let csrfInput = form.querySelector('input[name="_csrf"]');

    if (!csrfInput || !csrfInput.value) {
      const csrfResponse = await fetch('/api/auth/csrf', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
      });
      const csrfData = await csrfResponse.json().catch(() => ({}));

      if (!csrfResponse.ok || !csrfData.csrfToken) {
        throw new Error('Unable to initialize CSRF protection');
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

    const response = await fetch('/api/auth/login', {
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
      if (message) {
        message.textContent = data.message || 'تعذر تسجيل الدخول';
      }
      return;
    }

    localStorage.removeItem('af_token');
    localStorage.setItem('af_user', JSON.stringify(data.user));

    const verifyResponse = await fetch('/api/auth/me', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    });
    const verified = await verifyResponse.json().catch(() => ({}));

    if (!verifyResponse.ok || !verified.user) {
      localStorage.removeItem('af_user');
      throw new Error(
        verified.message ||
        'تم قبول بيانات الدخول لكن المتصفح لم يحتفظ بالجلسة. حدّث الصفحة وحاول مرة أخرى.'
      );
    }

    localStorage.setItem('af_user', JSON.stringify(verified.user));

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
      message.textContent = 'تعذر الاتصال بالخادم، حاول مرة أخرى.';
    }
  } finally {
    form.dataset.submitting = '0';

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
