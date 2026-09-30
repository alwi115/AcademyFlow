'use strict';
document.addEventListener('DOMContentLoaded', () => {
 const code=document.getElementById('academyCode'),email=document.getElementById('academyEmail'),password=document.getElementById('academyPassword'),toggle=document.getElementById('academyPasswordToggle'),remember=document.getElementById('rememberLogin'),form=document.getElementById('academyLoginForm');
 if(!form)return;
 const composition=document.querySelector('.login-composition');
 if(!matchMedia('(prefers-reduced-motion: reduce)').matches&&matchMedia('(hover: hover)').matches){composition.addEventListener('pointermove',e=>{const r=composition.getBoundingClientRect();composition.style.setProperty('--drift-x',`${((e.clientX-r.left)/r.width-.5)*8}px`);composition.style.setProperty('--drift-y',`${((e.clientY-r.top)/r.height-.5)*6}px`);});composition.addEventListener('pointerleave',()=>{composition.style.setProperty('--drift-x','0px');composition.style.setProperty('--drift-y','0px');});}
 code.addEventListener('input',()=>{let value=code.value.toUpperCase().replace(/[^A-Z0-9-]/g,'');if(/^AF\d/.test(value))value='AF-'+value.slice(2).replace(/-/g,'');code.value=value.slice(0,32);});
 toggle.addEventListener('click',()=>{const show=password.type==='password';password.type=show?'text':'password';toggle.textContent=show?'إخفاء':'إظهار';toggle.setAttribute('aria-pressed',String(show));});
 try{const saved=JSON.parse(localStorage.getItem('af_login_hint')||'null');if(saved){code.value=String(saved.academyCode||'').slice(0,32);email.value=String(saved.email||'').slice(0,254);remember.checked=Boolean(code.value||email.value);}}catch{}
 remember.addEventListener('change',()=>{if(!remember.checked){try{localStorage.removeItem('af_login_hint');}catch{}}});
 form.addEventListener('submit',()=>{try{if(remember.checked)localStorage.setItem('af_login_hint',JSON.stringify({academyCode:code.value,email:email.value}));else localStorage.removeItem('af_login_hint');}catch{}});
 const dialog=document.getElementById('recoveryDialog');
 document.getElementById('forgotPassword').addEventListener('click',()=>location.assign('/account/forgot-password.html'));
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
});
