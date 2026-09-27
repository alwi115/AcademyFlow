'use strict';
(() => {
 const root=document.documentElement;
 const system=window.matchMedia('(prefers-color-scheme: dark)');
 let saved=null;
 try {const value=localStorage.getItem('af_appearance');if(value==='light'||value==='dark')saved=value;}catch{}
 function apply(theme){
  root.dataset.appearance=theme;
  const dark=theme==='dark';
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.content=dark?'#101b29':'#f6f8fc';
  document.querySelectorAll('[data-appearance-toggle]').forEach(button=>{
   button.setAttribute('aria-pressed',String(dark));
   button.setAttribute('aria-label',dark?'تشغيل الوضع الفاتح':'تشغيل الوضع الداكن');
   button.title=dark?'تشغيل الوضع الفاتح':'تشغيل الوضع الداكن';
   button.querySelector('[data-appearance-label]').textContent=dark?'فاتح':'داكن';
  });
 }
 apply(saved||(system.matches?'dark':'light'));
 document.addEventListener('DOMContentLoaded',()=>{
  apply(root.dataset.appearance);
  document.querySelectorAll('[data-appearance-toggle]').forEach(button=>button.addEventListener('click',()=>{
   saved=root.dataset.appearance==='dark'?'light':'dark';
   try {localStorage.setItem('af_appearance',saved);}catch{}
   apply(saved);
  }));
 });
 const followSystem=()=>{if(!saved)apply(system.matches?'dark':'light');};
 if(system.addEventListener)system.addEventListener('change',followSystem);
 else if(system.addListener)system.addListener(followSystem);
 window.addEventListener('storage',event=>{if(event.key==='af_appearance'){saved=event.newValue==='dark'||event.newValue==='light'?event.newValue:null;apply(saved||(system.matches?'dark':'light'));}});
})();
