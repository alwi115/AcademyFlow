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
    if(kind === 'superadmin') delete body.academyCode;

    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body)
    });

    const data = await r.json();

    if(!r.ok){
      msg.textContent = data.message || 'تعذر تسجيل الدخول';
      return;
    }

    localStorage.setItem('af_token', data.token);
    localStorage.setItem('af_user', JSON.stringify(data.user));

    if (data.user.role === 'superadmin') {
      location.href = '/superadmin/dashboard.html';
    } else if (data.user.role === 'student') {
      location.href = '/student/dashboard.html';
    } else {
      location.href = '/academy/dashboard.html';
    }
  } catch (err) {
    msg.textContent = 'تعذر الاتصال بالخادم، حاول مرة أخرى.';
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}
