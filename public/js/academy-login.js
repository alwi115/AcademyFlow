document.addEventListener('DOMContentLoaded', () => {
  const code = document.getElementById('academyCode');
  const password = document.getElementById('academyPassword');
  const toggle = document.getElementById('academyPasswordToggle');

  if (code) {
    code.addEventListener('input', () => {
      let value = code.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');

      if (/^AF\d/.test(value)) {
        value = 'AF-' + value.slice(2).replace(/-/g, '');
      }

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
});
