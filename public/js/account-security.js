document.addEventListener('DOMContentLoaded', async () => {
  const message = document.getElementById('message');
  const page = document.body.dataset.accountPage;
  let loginPath = '/academy/login.html';
  async function api(path, body) {
    const response = await fetch('/api/auth/' + path, { method: body ? 'POST' : 'GET', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'تعذر تنفيذ الطلب');
    return data;
  }
  function bind(id, path, transform, after) {
    const form = document.getElementById(id);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('button'); button.disabled = true; message.textContent = '';
      try {
        const body = Object.fromEntries(new FormData(form));
        const data = await api(path, transform ? transform(body, form) : body);
        message.textContent = 'تم تنفيذ الطلب بنجاح';
        if (after) after(data);
      } catch (err) { message.textContent = err.message; }
      finally { button.disabled = false; }
    });
  }
  if (page === 'forgot') {
    bind('recoveryForm', 'forgot-password', null, data => { message.textContent = data.message; }); return;
  }
  if (page === 'reset') {
    const token = new URLSearchParams(location.hash.slice(1)).get('token');
    history.replaceState(null, '', location.pathname);
    bind('resetForm', 'reset-password', body => ({ ...body, token }), () => { location.assign(loginPath); }); return;
  }
  try {
    const { user } = await api('me');
    const portal = ['student', 'instructor', 'superadmin'].includes(user.role) ? user.role : 'academy';
    loginPath = '/' + portal + '/login.html';
    document.getElementById('backLink').href = '/' + portal + '/dashboard.html';
    const settings = await api('security');
    document.getElementById('mfaStatus').textContent = settings.mfaEnabled ? 'مفعّلة' : 'غير مفعّلة';
    document.getElementById('setupForm').hidden = settings.mfaEnabled;
    document.getElementById('disableForm').hidden = !settings.mfaEnabled;
    document.querySelector('.mfa-code').hidden = !settings.mfaEnabled;
    for (const channel of ['email', 'whatsapp']) document.querySelector(`[name="${channel}"]`).checked = settings.notificationPreferences?.[channel] === true;
    bind('passwordForm', 'password', null, () => location.assign(loginPath));
    bind('setupForm', 'mfa/setup', null, data => {
      document.getElementById('mfaSecret').textContent = data.secret;
      document.getElementById('confirmForm').hidden = false;
    });
    bind('confirmForm', 'mfa/confirm', null, () => location.assign(loginPath));
    bind('disableForm', 'mfa/disable', null, () => location.assign(loginPath));
    bind('preferencesForm', 'preferences', (body, form) => ({ email: form.elements.email.checked, whatsapp: form.elements.whatsapp.checked }));
  } catch (err) { message.textContent = err.message; }
});
