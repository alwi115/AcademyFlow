const token = localStorage.getItem('af_token');
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const statusMap = {
  active: { label: 'نشطة', className: 'active' },
  trial: { label: 'تجريبية', className: 'trial' },
  grace: { label: 'فترة سماح', className: 'grace' },
  frozen: { label: 'موقوفة', className: 'frozen' },
  suspended: { label: 'معلقة', className: 'suspended' }
};

function showForm(){ document.getElementById('formPanel').hidden = false; }
function hideForm(){ document.getElementById('formPanel').hidden = true; }

function statusBadge(status){
  const item = statusMap[status] || { label: status || 'غير معروف', className: 'trial' };
  return `<span class="status ${item.className}">${item.label}</span>`;
}

async function load(){
  const [statsRes, academiesRes] = await Promise.all([
    fetch('/api/superadmin/stats', { headers }),
    fetch('/api/superadmin/academies', { headers })
  ]);

  if(statsRes.status === 401 || statsRes.status === 403){
    location.href = '/superadmin/login.html';
    return;
  }

  const stats = await statsRes.json();
  const academies = await academiesRes.json();

  document.getElementById('stats').innerHTML = [
    ['إجمالي الأكاديميات', stats.total, 'A'],
    ['النشطة', stats.active, '✓'],
    ['التجريبية', stats.trial, 'T'],
    ['الموقوفة', stats.frozen, '!']
  ].map(item => `
    <article class="stat-card">
      <div class="stat-top"><small>${item[0]}</small><span class="side-icon">${item[2]}</span></div>
      <strong>${item[1]}</strong>
    </article>
  `).join('');

  document.getElementById('rows').innerHTML = academies.length ? academies.map(x => `
    <tr>
      <td><b>${x.code}</b></td>
      <td>${x.name}</td>
      <td>${statusBadge(x.status)}</td>
      <td>${x.trialEndsAt ? new Date(x.trialEndsAt).toLocaleDateString('en-GB') : '-'}</td>
    </tr>
  `).join('') : `<tr><td colspan="4" class="empty">لا توجد أكاديميات مضافة حتى الآن.</td></tr>`;
}

document.getElementById('academyForm').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.currentTarget;
  const btn = form.querySelector('button[type="submit"]');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'جاري الإنشاء...';
  const body = Object.fromEntries(new FormData(form).entries());
  try {
    const r = await fetch('/api/superadmin/academies', {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    const data = await r.json();
    const msg = document.getElementById('createMsg');
    if(!r.ok){
      msg.textContent = data.message || 'حدث خطأ أثناء الإنشاء';
      return;
    }
    msg.style.color = 'var(--success)';
    msg.textContent = `تم إنشاء ${data.name} بنجاح — الكود ${data.code}`;
    form.reset();
    await load();
    setTimeout(() => hideForm(), 700);
  } catch(err){
    document.getElementById('createMsg').textContent = 'تعذر الاتصال بالخادم.';
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});

document.getElementById('formPanel').addEventListener('click', e => {
  if(e.target.id === 'formPanel') hideForm();
});

load();
