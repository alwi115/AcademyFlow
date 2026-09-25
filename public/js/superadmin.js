
const token=localStorage.getItem('af_token');
const h={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
const statusText={active:'نشطة',trial:'تجريبية',grace:'فترة سماح',frozen:'موقوفة',suspended:'معلقة'};
function showForm(){document.getElementById('formPanel').hidden=false}
function hideForm(){document.getElementById('formPanel').hidden=true}
function statusBadge(status){
  const safe=['active','trial','grace','frozen','suspended'].includes(status)?status:'trial';
  return `<span class="status-pill status-${safe}">${statusText[status]||status}</span>`;
}
async function load(){
  const [s,a]=await Promise.all([
    fetch('/api/superadmin/stats',{headers:h}),
    fetch('/api/superadmin/academies',{headers:h})
  ]);
  if(s.status===401||s.status===403){location.href='/owner/login.html';return}
  const stats=await s.json(),academies=await a.json();
  const cards=[
    ['الإجمالي',stats.total,'A'],
    ['النشطة',stats.active,'✓'],
    ['التجريبية',stats.trial,'T'],
    ['الموقوفة',stats.frozen,'!']
  ];
  document.getElementById('stats').innerHTML=cards.map(x=>`
    <article class="stat">
      <div class="stat-head"><small>${x[0]}</small><span class="stat-icon">${x[2]}</span></div>
      <strong>${x[1]}</strong><span class="trend">AcademyFlow</span>
    </article>`).join('');
  document.getElementById('rows').innerHTML=academies.length?academies.map(x=>`
    <tr>
      <td><b>${x.code}</b></td>
      <td>${x.name}</td>
      <td>${statusBadge(x.status)}</td>
      <td>${x.trialEndsAt?new Date(x.trialEndsAt).toLocaleDateString('en-GB'):'-'}</td>
    </tr>`).join(''):'<tr><td colspan="4" class="empty-state">ما فيه أكاديميات مضافة إلى الآن.</td></tr>';
}
document.getElementById('academyForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const btn=e.currentTarget.querySelector('button:not([type="button"])');
  const original=btn.textContent;
  btn.disabled=true;btn.textContent='جاري الإنشاء...';
  const body=Object.fromEntries(new FormData(e.currentTarget).entries());
  try{
    const r=await fetch('/api/superadmin/academies',{method:'POST',headers:h,body:JSON.stringify(body)});
    const d=await r.json();
    const msg=document.getElementById('createMsg');
    msg.className='form-msg '+(r.ok?'toast-success':'toast-error');
    msg.textContent=r.ok?`تم إنشاء ${d.name} بنجاح — الكود ${d.code}`:(d.message||'حدث خطأ');
    if(r.ok){e.currentTarget.reset();await load();setTimeout(hideForm,900)}
  }catch{
    document.getElementById('createMsg').textContent='تعذر الاتصال بالسيرفر.';
  }finally{btn.disabled=false;btn.textContent=original}
});
document.getElementById('formPanel').addEventListener('click',e=>{if(e.target.id==='formPanel')hideForm()});
load();
