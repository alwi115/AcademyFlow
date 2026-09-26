document.addEventListener('DOMContentLoaded', () => {
  const code = document.getElementById('academyCode');
  const email = document.getElementById('academyEmail');
  const password = document.getElementById('academyPassword');
  const toggle = document.getElementById('academyPasswordToggle');
  const remember = document.getElementById('rememberLogin');
  const form = document.getElementById('academyLoginForm');

  if (code) {
    code.addEventListener('input', () => {
      let value = code.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
      if (/^AF\d/.test(value)) value = 'AF-' + value.slice(2).replace(/-/g, '');
      code.value = value.slice(0, 32);
    });
  }

  if (password && toggle) {
    toggle.addEventListener('click', () => {
      const hidden = password.type === 'password';
      password.type = hidden ? 'text' : 'password';
      toggle.textContent = hidden ? 'إخفاء' : 'إظهار';
      toggle.setAttribute('aria-pressed', hidden ? 'true' : 'false');
      password.focus({ preventScroll: true });
    });
  }

  try {
    const saved = JSON.parse(localStorage.getItem('af_login_hint') || 'null');
    if (saved && code && email && remember) {
      code.value = String(saved.academyCode || '').slice(0, 32);
      email.value = String(saved.email || '').slice(0, 254);
      remember.checked = Boolean(code.value || email.value);
    }
  } catch {}

  if (form && remember) {
    form.addEventListener('submit', () => {
      if (remember.checked) {
        localStorage.setItem('af_login_hint', JSON.stringify({
          academyCode: code ? code.value : '',
          email: email ? email.value : ''
        }));
      } else {
        localStorage.removeItem('af_login_hint');
      }
    });
  }
});