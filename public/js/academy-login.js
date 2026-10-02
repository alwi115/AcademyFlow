'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('academyLoginForm');
  if (!form) return;

  const code = document.getElementById('academyCode');
  const email = document.getElementById('academyEmail');
  const password = document.getElementById('academyPassword');
  const toggle = document.getElementById('academyPasswordToggle');
  const remember = document.getElementById('rememberLogin');
  const forgot = document.getElementById('forgotPassword');
  const message = document.getElementById('msg');

  requestAnimationFrame(() => document.body.classList.add('ready'));

  code.addEventListener('input', () => {
    let value = code.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (/^AF\d/.test(value)) value = `AF-${value.slice(2).replace(/-/g, '')}`;
    code.value = value.slice(0, 32);
    code.removeAttribute('aria-invalid');
    message.classList.remove('error', 'success');
  });

  [email, password].forEach(input => input.addEventListener('input', () => {
    input.removeAttribute('aria-invalid');
    message.classList.remove('error', 'success');
  }));

  toggle.addEventListener('click', () => {
    const show = password.type === 'password';
    password.type = show ? 'text' : 'password';
    toggle.textContent = show ? 'إخفاء' : 'إظهار';
    toggle.setAttribute('aria-pressed', String(show));
  });

  try {
    const saved = JSON.parse(localStorage.getItem('af_login_hint') || 'null');
    if (saved && typeof saved === 'object') {
      code.value = String(saved.academyCode || '').slice(0, 32);
      email.value = String(saved.email || '').slice(0, 254);
      remember.checked = Boolean(code.value || email.value);
    }
  } catch {}

  remember.addEventListener('change', () => {
    if (!remember.checked) {
      try { localStorage.removeItem('af_login_hint'); } catch {}
    }
  });

  form.addEventListener('submit', event => {
    const invalid = [...form.querySelectorAll('input[required]')].filter(input => !input.checkValidity());
    if (invalid.length) {
      event.preventDefault();
      event.stopImmediatePropagation();
      invalid.forEach(input => input.setAttribute('aria-invalid', 'true'));
      message.className = 'error';
      message.textContent = 'أكمل بيانات الدخول المطلوبة ثم حاول مرة أخرى.';
      invalid[0].focus();
      return;
    }

    try {
      if (remember.checked) {
        localStorage.setItem('af_login_hint', JSON.stringify({ academyCode: code.value, email: email.value }));
      } else {
        localStorage.removeItem('af_login_hint');
      }
    } catch {}
  });

  forgot.addEventListener('click', () => location.assign('/account/forgot-password.html'));
});
