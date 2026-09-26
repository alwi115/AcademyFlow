(function(){
  const modules={
    students:{
      kicker:'STUDENT CORE',title:'الطلاب',
      text:'ملف الطالب يجمع بياناته وتسجيلاته ودوراته وحضوره في مكان واحد، ويخلي الرجوع لتاريخه أسهل للإدارة.',
      points:['ملف موحد','تسجيل بالدورات','متابعة الحضور'],visual:'STUDENT'
    },
    courses:{
      kicker:'COURSE ENGINE',title:'الدورات',
      text:'كل دورة تجمع المدرب والطلاب والمواعيد والمحاضرات تحت نفس السياق، بدل ما تكون مجرد اسم في جدول.',
      points:['جدول الدورة','الطلاب المسجلون','المحاضرات'],visual:'COURSE'
    },
    attendance:{
      kicker:'ATTENDANCE TRACK',title:'الحضور',
      text:'تسجيل الحضور يبقى مرتبطًا بالطالب والدورة واليوم، عشان المتابعة والتقارير تكون مبنية على بيانات واضحة.',
      points:['تسجيل يومي','ربط بالطالب','تقارير حضور'],visual:'TRACK'
    },
    zoom:{
      kicker:'LIVE LAYER',title:'Zoom',
      text:'ربط حساب Zoom الخاص بالأكاديمية يخلي المحاضرة المباشرة مرتبطة بالدورة والمدرب والموعد بدل رابط منفصل.',
      points:['حساب الأكاديمية','إدارة المحاضرات','وصول أسهل'],visual:'LIVE'
    },
    reports:{
      kicker:'REPORTING',title:'التقارير',
      text:'التقارير تقرأ البيانات المرتبطة داخل النظام وتعرض صورة أوضح للإدارة بدون جمع المعلومات يدويًا من عدة أماكن.',
      points:['بيانات مترابطة','متابعة أوضح','قرار أسرع'],visual:'REPORT'
    },
    roles:{
      kicker:'ACCESS CONTROL',title:'الصلاحيات',
      text:'كل مستخدم يدخل للواجهة المناسبة له ويشوف الصلاحيات المرتبطة بدوره، مع بقاء بيانات الأكاديمية داخل مساحتها.',
      points:['مالك','إدارة','مدرب / طالب'],visual:'ACCESS'
    }
  };

  function initReveal(){
    const items=document.querySelectorAll('[data-reveal]');
    if(!('IntersectionObserver' in window)){
      items.forEach(el=>el.classList.add('is-visible'));
      return;
    }
    const io=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    },{threshold:.1});
    items.forEach(el=>io.observe(el));
  }

  function initExplorer(){
    const tabs=[...document.querySelectorAll('.module-tab')];
    const detail=document.getElementById('moduleDetail');
    if(!tabs.length||!detail) return;

    const kicker=document.getElementById('moduleKicker');
    const title=document.getElementById('moduleTitle');
    const text=document.getElementById('moduleText');
    const p1=document.getElementById('modulePoint1');
    const p2=document.getElementById('modulePoint2');
    const p3=document.getElementById('modulePoint3');
    const visualTitle=document.getElementById('moduleVisualTitle');
    const visual=detail.querySelector('.module-visual');

    function activate(tab){
      const data=modules[tab.dataset.module];
      if(!data) return;
      tabs.forEach(btn=>{
        const active=btn===tab;
        btn.classList.toggle('is-active',active);
        btn.setAttribute('aria-selected',active?'true':'false');
      });
      detail.classList.remove('is-changing');
      void detail.offsetWidth;
      detail.classList.add('is-changing');
      kicker.textContent=data.kicker;
      title.textContent=data.title;
      text.textContent=data.text;
      p1.textContent=data.points[0];
      p2.textContent=data.points[1];
      p3.textContent=data.points[2];
      visualTitle.textContent=data.visual;
      visual.dataset.state=tab.dataset.module;
    }

    tabs.forEach(tab=>tab.addEventListener('click',()=>activate(tab)));
  }

  document.addEventListener('DOMContentLoaded',()=>{
    initReveal();
    initExplorer();
  });
})();