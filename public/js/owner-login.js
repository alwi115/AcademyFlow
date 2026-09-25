document.addEventListener('DOMContentLoaded', () => {
  const password = document.getElementById('ownerPassword');
  const toggle = document.getElementById('ownerPasswordToggle');
  const username = document.querySelector('input[name="username"]');

  if (username) {
    username.addEventListener('input', () => {
      username.value = username.value.replace(/\s+/g, '').toLowerCase();
    });
  }

  if (password && toggle) {
    toggle.addEventListener('click', () => {
      const hidden = password.type === 'password';
      password.type = hidden ? 'text' : 'password';
      toggle.textContent = hidden ? 'إخفاء' : 'إظهار';
      toggle.setAttribute('aria-pressed', hidden ? 'true' : 'false');
      password.focus({ preventScroll: true });
      const length = password.value.length;
      try { password.setSelectionRange(length,length); } catch {}
    });
  }
});
