(()=> {
  'use strict';

  const qs=(s,r=document)=>r.querySelector(s);
  const qsa=(s,r=document)=>[...r.querySelectorAll(s)];
  const LANG_KEY='af_public_lang';

  const translations=new Map([
    ['المنصة','Platform'],['الحلول','Solutions'],['الفروع','Branches'],['الباقات','Pricing'],['الأسئلة','FAQ'],
    ['تسجيل الدخول','Log in'],['ابدأ تجربة 15 يوم','Start 15-day trial'],['استكشف AcademyFlow','Explore AcademyFlow'],
    ['نظام تشغيل للأكاديميات ومراكز التدريب','Operating system for academies and training centers'],
    ['خلّ أكاديميتك تشتغل كنظام واحد،','Run your academy as one connected system,'],
    ['مو كأدوات متفرقة.','not a collection of disconnected tools.'],
    ['AcademyFlow يربط الطلاب والمدربين والدورات والحضور والمدفوعات والفروع ومحاضرات Zoom في مساحة تشغيل واحدة واضحة للإدارة والفريق.','AcademyFlow connects students, instructors, courses, attendance, payments, branches, and Zoom classes in one clear operating workspace.'],
    ['يوم تجربة','day trial'],['مساحة مستقلة لكل أكاديمية','isolated workspace per academy'],['متابعة صحة النظام','system health monitoring'],
    ['الطلاب والدورات','Students & courses'],['من التسجيل إلى التخرج','From enrollment to completion'],['المالية والتحصيل','Finance & collection'],['مدفوعات مرتبطة بالطالب','Payments tied to each student'],
    ['إدارة الفروع','Branch management'],['تشغيل مركزي بصلاحيات واضحة','Central control with scoped access'],['Zoom والحضور','Zoom & attendance'],['الجلسة داخل سياق الدورة','Sessions stay tied to the course'],
    ['المعلومة ما تضيع بين الأنظمة. كل خطوة تكمل اللي قبلها.','Data stays connected. Every step continues the one before it.'],
    ['بدل ملفات منفصلة للجداول والحضور والمدفوعات، AcademyFlow يبني رحلة تشغيل مترابطة من أول تسجيل الطالب إلى التقارير.','Instead of separate files for schedules, attendance, and payments, AcademyFlow keeps the full operating journey connected from enrollment to reporting.'],
    ['رحلة تشغيل واحدة','One operating journey'],['تسجيل الطالب','Student registration'],['الالتحاق بالدورة','Course enrollment'],['الجدول والحضور','Schedule & attendance'],['الدفع والمتابعة','Payments & follow-up'],['التقرير','Reporting'],
    ['الدورات والجداول والحضور في نفس مساحة التشغيل.','Courses, schedules, and attendance in the same operating workspace.'],
    ['المالية ما تكون جزيرة بعيدة عن التشغيل.','Finance stays connected to operations.'],['شوف الباقات','View pricing'],
    ['كل فرع يشتغل باستقلاله. والإدارة تشوف الصورة كاملة.','Every branch operates independently while management sees the full picture.'],
    ['Zoom جزء من سير العمل، مب رابط منفصل عنه.','Zoom is part of the workflow, not a detached link.'],
    ['كل شخص يشوف اللي يحتاجه. ولا أكثر.','Everyone sees what they need — and nothing more.'],
    ['المالك','Owner'],['المدير','Manager'],['المدرب','Instructor'],['المالية','Finance'],['الإدارة','Admin staff'],
    ['بيانات الأكاديمية تحتاج نظام يتعامل معها بجدية.','Academy data deserves a system that treats it seriously.'],
    ['الباقات اللي عندك في النظام، تظهر هنا مباشرة.','Your live AcademyFlow plans appear here automatically.'],
    ['الأسعار والمميزات تُسحب من خطط AcademyFlow الفعلية، عشان صفحة الزوار ما تعرض معلومات قديمة.','Prices and features come from the live AcademyFlow plan configuration, so the public site stays current.'],
    ['أسئلة قبل ما تبدأ.','Questions before you start.'],
    ['ابدأ من تشغيل واضح. وخله يكبر مع أكاديميتك.','Start with clear operations. Scale them with your academy.'],
    ['منصة تشغيل للأكاديميات ومراكز التدريب.','An operating platform for academies and training centers.'],
    ['المنتج','Product'],['الحساب','Account'],['قانوني','Legal'],['الخصوصية','Privacy'],['الشروط','Terms'],['الاسترداد','Refunds'],['الدعم','Support'],
    ['ابدأ التجربة','Start trial']
  ]);

  function textNodes(root=document.body){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(node){
      if(!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if(node.parentElement && ['SCRIPT','STYLE'].includes(node.parentElement.tagName)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }});
    const nodes=[]; let n; while((n=walker.nextNode())) nodes.push(n); return nodes;
  }

  let arabicSnapshot=null;
  function setLanguage(lang){
    const next=lang==='en'?'en':'ar';
    if(!arabicSnapshot){
      arabicSnapshot=textNodes().map(node=>({node,value:node.nodeValue}));
    }
    document.documentElement.lang=next;
    document.documentElement.dir=next==='en'?'ltr':'rtl';
    document.body.dataset.lang=next;
    const button=qs('[data-lang-toggle]');
    if(button) button.textContent=next==='en'?'AR':'EN';

    if(next==='ar'){
      arabicSnapshot.forEach(x=>{ if(x.node.isConnected) x.node.nodeValue=x.value; });
    }else{
      arabicSnapshot.forEach(x=>{
        if(!x.node.isConnected) return;
        const raw=x.value;
        const trimmed=raw.trim();
        const translated=translations.get(trimmed);
        if(translated){
          const start=raw.match(/^\s*/)?.[0]||'';
          const end=raw.match(/\s*$/)?.[0]||'';
          x.node.nodeValue=start+translated+end;
        }
      });
    }
    try{localStorage.setItem(LANG_KEY,next);}catch{}
  }

  function initLanguage(){
    let stored='ar';
    try{stored=localStorage.getItem(LANG_KEY)||'ar';}catch{}
    setLanguage(stored);
    qs('[data-lang-toggle]')?.addEventListener('click',()=>setLanguage(document.documentElement.lang==='en'?'ar':'en'));
  }

  function initHeader(){
    const header=qs('#afHeader');
    const update=()=>header?.classList.toggle('is-scrolled',window.scrollY>12);
    update();
    addEventListener('scroll',update,{passive:true});
  }

  function initMobileMenu(){
    const menu=qs('[data-mobile-menu]');
    const openBtn=qs('[data-mobile-menu-button]');
    const closeBtn=qs('[data-mobile-menu-close]');
    if(!menu||!openBtn) return;
    const setOpen=(open)=>{
      menu.classList.toggle('is-open',open);
      menu.setAttribute('aria-hidden',open?'false':'true');
      openBtn.setAttribute('aria-expanded',open?'true':'false');
      document.body.classList.toggle('af-menu-open',open);
      if(open) setTimeout(()=>closeBtn?.focus(),20);
    };
    openBtn.addEventListener('click',()=>setOpen(openBtn.getAttribute('aria-expanded')!=='true'));
    closeBtn?.addEventListener('click',()=>setOpen(false));
    qsa('a',menu).forEach(a=>a.addEventListener('click',()=>setOpen(false)));
    addEventListener('keydown',e=>{if(e.key==='Escape'&&menu.classList.contains('is-open')){setOpen(false);openBtn.focus();}});
    addEventListener('resize',()=>{if(innerWidth>860)setOpen(false);},{passive:true});
  }

  function initReveal(){
    const items=qsa('[data-reveal]');
    if(matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)){
      items.forEach(el=>el.classList.add('is-visible')); return;
    }
    const io=new IntersectionObserver(entries=>entries.forEach(entry=>{
      if(entry.isIntersecting){entry.target.classList.add('is-visible');io.unobserve(entry.target);}
    }),{threshold:.1,rootMargin:'0px 0px -30px'});
    items.forEach(el=>io.observe(el));
  }

  function initRoles(){
    const tabs=qsa('[data-role-tab]');
    const panels=qsa('[data-role-panel]');
    tabs.forEach(tab=>tab.addEventListener('click',()=>{
      const key=tab.dataset.roleTab;
      tabs.forEach(t=>{const active=t===tab;t.classList.toggle('is-active',active);t.setAttribute('aria-selected',active?'true':'false');});
      panels.forEach(p=>{const active=p.dataset.rolePanel===key;p.hidden=!active;p.classList.toggle('is-active',active);});
    }));
  }

  function initFaq(){
    qsa('.af-faq-list details').forEach(item=>item.addEventListener('toggle',()=>{
      if(!item.open) return;
      qsa('.af-faq-list details').forEach(other=>{if(other!==item) other.open=false;});
    }));
  }

  function esc(value){
    return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  function planDescription(plan,index){
    const limits=plan.limits||{};
    const bits=[];
    if(Number(limits.students)>0) bits.push(`حتى ${Number(limits.students).toLocaleString('en-US')} طالب`);
    if(Number(limits.branches)>0) bits.push(`${Number(limits.branches)} فرع`);
    if(Number(limits.instructors)>0) bits.push(`${Number(limits.instructors)} مدربين`);
    return bits.slice(0,2).join(' · ') || (index===1?'للأكاديميات اللي تحتاج تشغيل أوسع.':'باقة مرنة حسب حجم الأكاديمية.');
  }

  function renderPlans(plans){
    const root=qs('#pricingPlans');
    if(!root) return;
    if(!Array.isArray(plans)||!plans.length){
      root.innerHTML='<div class="af-pricing-empty">الباقات غير متاحة للعرض حاليًا. تواصل مع فريق AcademyFlow لمعرفة الخيارات المتوفرة.</div>';
      return;
    }
    const active=plans.slice(0,3);
    const featured=active.length===1?0:1;
    root.innerHTML=active.map((plan,index)=>{
      const monthly=Number(plan.monthlyPrice||0);
      const yearly=Number(plan.yearlyPrice||0);
      const price=monthly>0?`${monthly.toLocaleString('en-OM',{maximumFractionDigits:3})} <small>OMR / شهريًا</small>`:'<span style="font-size:.55em">حسب الاتفاق</span>';
      const features=(Array.isArray(plan.features)&&plan.features.length?plan.features:[
        'إدارة الطلاب والدورات','الحضور والجداول','صلاحيات المستخدمين','التقارير الأساسية'
      ]).slice(0,8);
      const limits=plan.limits||{};
      const limitItems=[
        Number(limits.students)>0?`${Number(limits.students).toLocaleString('en-US')} طالب`:null,
        Number(limits.instructors)>0?`${Number(limits.instructors)} مدرب`:null,
        Number(limits.branches)>0?`${Number(limits.branches)} فرع`:null
      ].filter(Boolean);
      return `<article class="af-plan ${index===featured?'is-featured':''}">
        ${index===featured?'<span class="af-plan-tag">الأكثر توازنًا</span>':''}
        <span class="af-plan-code">${esc(plan.code||'PLAN')}</span>
        <h3>${esc(plan.name||'AcademyFlow')}</h3>
        <p class="af-plan-description">${esc(planDescription(plan,index))}</p>
        <div class="af-plan-price">${price}</div>
        ${yearly>0? `<small style="display:block;margin:-8px 0 14px;color:inherit;opacity:.65;font-size:7px">سنويًا: ${yearly.toLocaleString('en-OM',{maximumFractionDigits:3})} OMR</small>`:''}
        <a class="af-button af-button-primary" href="/academy/login.html">ابدأ تجربة 15 يوم</a>
        <ul class="af-plan-features">${features.map(f=>`<li>${esc(f)}</li>`).join('')}</ul>
        <div class="af-plan-limits">${limitItems.map(v=>`<span>${esc(v)}</span>`).join('')}</div>
      </article>`;
    }).join('');
  }

  async function loadPublicConfig(){
    try{
      const [configResponse,plansResponse]=await Promise.all([
        fetch('/api/public/legal-config',{credentials:'same-origin',headers:{Accept:'application/json'}}),
        fetch('/api/public/plans',{credentials:'same-origin',headers:{Accept:'application/json'}})
      ]);
      if(configResponse.ok){
        const config=await configResponse.json();
        const days=Number(config.trialDays||15);
        qsa('a,button,p,span').forEach(el=>{
          if(el.children.length===0 && /15 يوم/.test(el.textContent||'')) el.textContent=el.textContent.replace(/15 يوم/g,`${days} يوم`);
        });
      }
      if(plansResponse.ok){
        const data=await plansResponse.json();
        renderPlans(data.plans);
      }else renderPlans([]);
    }catch(error){
      console.warn('AcademyFlow public config unavailable',error);
      renderPlans([]);
    }
  }

  function syncThemeMeta(){
    const meta=qs('meta[name="theme-color"]');
    if(!meta) return;
    meta.content=document.documentElement.dataset.theme==='dark'?'#111411':'#f2f0e8';
  }

  document.addEventListener('DOMContentLoaded',()=>{
    initHeader();
    initMobileMenu();
    initReveal();
    initRoles();
    initFaq();
    initLanguage();
    loadPublicConfig();
    syncThemeMeta();
  });
  addEventListener('academyflow:themechange',syncThemeMeta);
})();