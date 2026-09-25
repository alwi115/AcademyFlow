
async function login(e, kind){
  e.preventDefault();
  const form=e.currentTarget;
  const button=form.querySelector('button[type="submit"]');
  const msg=document.getElementById('msg');
  const original=button.innerHTML;
  msg.textContent='';
  button.disabled=true;
  button.innerHTML='جاري التحقق...';
  try{
    const body=Object.fromEntries(new FormData(form).entries());
    if(kind==='superadmin') delete body.academyCode;
    const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await r.json();
    if(!r.ok){msg.textContent=data.message||'تعذر تسجيل الدخول';return;}
    localStorage.setItem('af_token',data.token);
    localStorage.setItem('af_user',JSON.stringify(data.user));
    location.href=kind==='superadmin'?'/superadmin/dashboard.html':'/academy/dashboard.html';
  }catch{
    msg.textContent='تعذر الاتصال بالسيرفر، جرّب مرة ثانية.';
  }finally{
    button.disabled=false;
    button.innerHTML=original;
  }
}
