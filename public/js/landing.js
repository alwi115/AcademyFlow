(function(){
  const features = {
    students:{
      index:'01',tag:'STUDENT CORE',title:'الطلاب',
      text:'ملف واحد يمشي مع الطالب من أول تسجيله، ويربط دوراته وحضوره ومحاضراته بدل ما تتوزع معلوماته في أكثر من مكان.',
      links:['التسجيل','الدورات','الحضور'],connected:'الدورات · الحضور · التقارير',angle:0
    },
    courses:{
      index:'02',tag:'COURSE ENGINE',title:'الدورات',
      text:'الدورة تصير مساحة تشغيل كاملة: الطلاب المسجلين، المدرب، المواعيد والمحاضرات والمتابعة كلها تحت سياق واحد.',
      links:['الجدول','التسجيل','المحاضرات'],connected:'الطلاب · المدربين · Zoom',angle:45
    },
    instructors:{
      index:'03',tag:'INSTRUCTOR SPACE',title:'المدربين',
      text:'كل مدرب يدخل لمساحته ويشوف الأشياء المرتبطة به فقط: دوراته، طلابه ومحاضراته، بدون زحمة صلاحيات الإدارة.',
      links:['الدورات','الطلاب','المحاضرات'],connected:'الصلاحيات · الدورات · Zoom',angle:90
    },
    zoom:{
      index:'04',tag:'LIVE LAYER',title:'Zoom',
      text:'حساب Zoom الخاص بالأكاديمية يدخل ضمن المنظومة، عشان المحاضرة المباشرة تكون مرتبطة بالدورة والمدرب والموعد بدل رابط منفصل.',
      links:['الحساب','الاجتماعات','المواعيد'],connected:'الدورات · المدربين · الطلاب',angle:135
    },
    attendance:{
      index:'05',tag:'ATTENDANCE TRACK',title:'الحضور',
      text:'الحضور ما يكون رقم لحاله؛ يبقى مربوط بالطالب والدورة واليوم، عشان المتابعة والتقارير تعكس اللي صار فعليًا.',
      links:['اليوم','الطالب','الدورة'],connected:'الطلاب · الدورات · التقارير',angle:180
    },
    reports:{
      index:'06',tag:'INSIGHT LAYER',title:'التقارير',
      text:'بدل جمع المعلومة يدويًا، التقارير تقرأ البيانات المترابطة وتحوّل حركة الأكاديمية إلى صورة أوضح للإدارة.',
      links:['المتابعة','التحليل','الإدارة'],connected:'الحضور · الطلاب · الدورات',angle:225
    },
    branches:{
      index:'07',tag:'BRANCH CONTROL',title:'الفروع',
      text:'الفروع تظل تحت نفس الأكاديمية لكن بتنظيم واضح للمستخدمين والعمل، عشان التوسع ما يحول الإدارة إلى فوضى.',
      links:['المستخدمون','التنظيم','التوسع'],connected:'الصلاحيات · المستخدمين · الأكاديمية',angle:270
    },
    roles:{
      index:'08',tag:'ACCESS CONTROL',title:'الصلاحيات',
      text:'كل مستخدم يشوف ويسوي اللي يسمح له دوره فقط، والنظام يوجهه تلقائيًا للمساحة المناسبة بعد تسجيل الدخول.',
      links:['المالك','الإدارة','المدرب'],connected:'الحسابات · البوابات · عزل البيانات',angle:315
    }
  };

  const reveal = () => {
    const items = document.querySelectorAll('[data-reveal]');
    if(!('IntersectionObserver' in window)){
      items.forEach(el=>el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    },{threshold:.12});
    items.forEach(el=>io.observe(el));
  };

  const wheel = () => {
    const root=document.getElementById('systemWheel');
    const detail=document.getElementById('systemDetail');
    if(!root||!detail) return;

    const buttons=[...root.querySelectorAll('.wheel-item')];
    const rotor=document.getElementById('wheelRotor');
    const core=document.getElementById('wheelCore');
    const coreTitle=document.getElementById('wheelCoreTitle');
    const nodes={
      index:document.getElementById('systemDetailIndex'),
      tag:document.getElementById('systemDetailTag'),
      title:document.getElementById('systemDetailTitle'),
      text:document.getElementById('systemDetailText'),
      a:document.getElementById('systemDetailLinkA'),
      b:document.getElementById('systemDetailLinkB'),
      c:document.getElementById('systemDetailLinkC'),
      connected:document.getElementById('systemDetailConnected')
    };

    let activeIndex=0;
    let rotation=0;

    const activate=(index)=>{
      if(index<0) index=buttons.length-1;
      if(index>=buttons.length) index=0;
      activeIndex=index;
      const btn=buttons[index];
      const key=btn.dataset.feature;
      const data=features[key];
      if(!data) return;

      buttons.forEach((button,i)=>{
        const on=i===index;
        button.classList.toggle('is-active',on);
        button.setAttribute('aria-pressed',on?'true':'false');
      });

      const target=data.angle;
      const current=((rotation%360)+360)%360;
      let delta=target-current;
      if(delta>180) delta-=360;
      if(delta<-180) delta+=360;
      rotation+=delta;
      if(rotor) rotor.style.transform='rotate('+rotation+'deg)';

      detail.classList.remove('is-changing');
      void detail.offsetWidth;
      detail.classList.add('is-changing');

      nodes.index.textContent=data.index;
      nodes.tag.textContent=data.tag;
      nodes.title.textContent=data.title;
      nodes.text.textContent=data.text;
      nodes.a.textContent=data.links[0];
      nodes.b.textContent=data.links[1];
      nodes.c.textContent=data.links[2];
      nodes.connected.textContent=data.connected;
      if(coreTitle) coreTitle.textContent=data.title;
    };

    buttons.forEach((button,index)=>{
      button.addEventListener('click',()=>activate(index));
      button.addEventListener('keydown',(event)=>{
        if(event.key==='ArrowLeft'||event.key==='ArrowDown'){
          event.preventDefault();activate(index+1);buttons[(index+1)%buttons.length].focus();
        }
        if(event.key==='ArrowRight'||event.key==='ArrowUp'){
          event.preventDefault();activate(index-1);buttons[(index-1+buttons.length)%buttons.length].focus();
        }
      });
    });
    if(core) core.addEventListener('click',()=>activate(activeIndex+1));
  };

  document.addEventListener('DOMContentLoaded',()=>{
    reveal();
    wheel();
  });
})();