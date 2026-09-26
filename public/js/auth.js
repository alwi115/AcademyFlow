async function login(e, kind){
  e.preventDefault();

  const form = e.currentTarget;
  const btn = form.querySelector('button[type="submit"]');
  const msg = document.getElementById('msg');
  const original = btn.textContent;

  msg.textContent = '';
  btn.disabled = true;
  btn.textContent = 'جاري التحقق...';

  try {
    const body = Object.fromEntries(new FormData(form).entries());

    if (kind === 'superadmin') {
      delete body.academyCode;
      delete body.email;
    }

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      msg.textContent = data.message || 'تعذر تسجيل الدخول';
      return;
    }

    localStorage.removeItem('af_token');
    localStorage.setItem('af_user', JSON.stringify(data.user));

    if (data.user.role === 'superadmin') {
      location.replace('/superadmin/dashboard.html');
    } else if (data.user.role === 'student') {
      location.replace('/student/dashboard.html');
    } else if (data.user.role === 'instructor') {
      location.replace('/instructor/dashboard.html');
    } else {
      location.replace('/academy/dashboard.html');
    }
  } catch {
    msg.textContent = 'تعذر الاتصال بالخادم، حاول مرة أخرى.';
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function logoutSession(destination){
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    });
  } catch {}

  localStorage.removeItem('af_token');
  localStorage.removeItem('af_user');
  location.replace(destination || '/academy/login.html');
}
