const token=localStorage.getItem('af_token');
const h={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
function showForm(){document.getElementById('formPanel').hidden=false}
async function load(){
  const [s,a]=await Promise.all([fetch('/api/superadmin/stats',{headers:h}),fetch('/api/superadmin/academies',{headers:h})]);
  if(s.status===401||s.status===403){location.href='/superadmin/login.html';return}
  const stats=await s.json(), academies=await a.json();
  document.getElementById('stats').innerHTML=[['الإجمالي',stats.total],['النشطة',stats.active],['التجريبية',stats.trial],['الموقوفة',stats.frozen]].map(x=>`<div class="stat"><span class="muted">${x[0]}</span><strong>${x[1]}</strong></div>`).join('');
  document.getElementById('rows').innerHTML=academies.map(x=>`<tr><td>${x.code}</td><td>${x.name}</td><td>${x.status}</td><td>${x.trialEndsAt?new Date(x.trialEndsAt).toLocaleDateString('en-GB'):'-'}</td></tr>`).join('');
}
document.getElementById('academyForm').addEventListener('submit',async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.currentTarget).entries());const r=await fetch('/api/superadmin/academies',{method:'POST',headers:h,body:JSON.stringify(body)});const d=await r.json();document.getElementById('createMsg').textContent=r.ok?`تم إنشاء ${d.name} بكود ${d.code}`:(d.message||'حدث خطأ');if(r.ok){e.currentTarget.reset();load()}});load();
