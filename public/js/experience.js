'use strict';
(() => {
 const $ = s => document.querySelector(s);
 const all = s => [...document.querySelectorAll(s)];
 const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
 const modules = [
 ['STUDENTS','◎','كل طالب، رحلة واضحة.','من التسجيل إلى آخر محاضرة، ملف واحد يجمع الدورات والحضور والمتابعة.',['التسجيل','الحضور','التقدّم']],
 ['COURSES','▤','المحتوى يلقى مساحته.','نظّم الدورات والمجموعات والدروس، واربط كل دورة بمدرّبها وطلابها.',['الدورات','المجموعات','الدروس']],
 ['SESSIONS','◷','كل محاضرة في وقتها.','رتّب المواعيد والمحاضرات المباشرة، واربط حساب Zoom الخاص بأكاديميتك.',['المواعيد','Zoom','الحضور']],
 ['PAYMENTS','↗','دفعات مرتّبة وواضحة.','تابع رسوم الطلاب وسجلات المدفوعات ضمن أكاديميتك، بدون ما تفقد سياق الدورة.',['الرسوم','السجلات','المتابعة']],
 ['REPORTS','▥','من المعلومة إلى الرؤية.','اجمع تفاصيل التشغيل في تقارير تساعد الإدارة تراجع الحضور والنشاط والنتائج.',['الحضور','النتائج','التقارير']],
 ['ACCESS','◇','كل مسؤولية، لها صلاحية.','مساحات للمالك والإدارة والمدرّب والطالب، بصلاحيات تناسب طبيعة عمل كل دور.',['المالك','الفريق','الطلاب']]
 ];
 function select(group, selected) {group.forEach(b=>{const active=b===selected;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});}
 all('[data-module]').forEach(button=>{
  function activate(){const i=Number(button.dataset.module),d=modules[i];all('[data-module]').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});all('.orbit-path').forEach((path,n)=>path.classList.toggle('active',n===i));$('#moduleIndex').textContent=`0${i+1} / ${d[0]}`;$('#moduleIcon').textContent=d[1];$('#moduleTitle').textContent=d[2];$('#moduleText').textContent=d[3];$('#moduleTags').replaceChildren(...d[4].map(t=>{const s=document.createElement('span');s.textContent=t;return s;}));}
  button.addEventListener('click',activate);
  button.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')activate();});
 });
 const flow=[['الإدارة تضبط البداية.','حدّد فروع الأكاديمية وفريق العمل، ووزّع الصلاحيات حسب مسؤولية كل شخص.'],['ملف الطالب هو نقطة الانطلاق.','اربط الطالب بدورته ومجموعته، وخلّ بياناته مرجع للحضور والمتابعة والمدفوعات.'],['الدورة تجمع أطراف الرحلة.','المحتوى والمدرّب والمواعيد والطلاب يرتبطوا في دورة واحدة واضحة.'],['الموعد يتحوّل لتجربة تعلّم.','نظّم جلساتك الحضورية ومحاضرات Zoom، وسجّل الحضور لكل مجموعة.'],['رسوم الطالب ضمن نفس السياق.','تابع سجلات المدفوعات المرتبطة بالطلاب عشان تكون الصورة المالية أوضح.'],['التفاصيل تصير صورة كاملة.','راجع التقارير المبنية من بيانات أكاديميتك، وتابع الحضور والتشغيل.']];
 all('[data-flow]').forEach(b=>b.addEventListener('click',()=>{const n=Number(b.dataset.flow);select(all('[data-flow]'),b);$('.network').classList.add('has-selection');all('[data-flow]').forEach(x=>x.classList.toggle('connected',Math.abs(Number(x.dataset.flow)-n)===1));$('#flowTitle').textContent=flow[n][0];$('#flowText').textContent=flow[n][1];}));
 const nav=$('.site-nav'),menu=$('.menu-toggle'),links=$('#mainNav');
 const closeMenu=()=>{links.classList.remove('open');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','فتح القائمة');menu.textContent='☰';};
 menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';links.classList.toggle('open',open);menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'إغلاق القائمة':'فتح القائمة');menu.textContent=open?'×':'☰';});
 links.addEventListener('click',e=>{if(e.target.closest('a'))closeMenu();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&links.classList.contains('open')){closeMenu();menu.focus();}});
 document.addEventListener('click',e=>{if(!nav.contains(e.target))closeMenu();});
 addEventListener('scroll',()=>nav.classList.toggle('scrolled',scrollY>30),{passive:true});
 const periods={week:{value:92,change:'↑ 6% عن الأسبوع السابق',bars:[65,78,85,94,87,75,92]},month:{value:88,change:'↑ 4% عن الشهر السابق',bars:[60,72,77,88,80,89,92]}};
 function drawPeriod(key){const d=periods[key];$('#attendanceMetric').textContent=d.value;$('#metricChange').textContent=d.change;$('#barChart').setAttribute('aria-label',`بيانات حضور توضيحية، معدل ${d.value}% خلال ${key==='week'?'الأسبوع':'الشهر'}`);$('#barChart').replaceChildren(...d.bars.map(v=>{const el=document.createElement('i');el.style.height=v+'%';return el;}));const labels=key==='week'?['السبت','الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة']:['01','05','10','15','20','25','30'];all('.chart-axis span').forEach((s,i)=>s.textContent=labels[i]);}
 drawPeriod('week');
 all('[data-period]').forEach(b=>b.addEventListener('click',()=>{select(all('[data-period]'),b);drawPeriod(b.dataset.period);}));
 const roles={admin:['مساحة الإدارة','صباح الإنجاز.','12','تصميم الواجهات','نظرة على الدورات والطلاب والمواعيد، في مكان واحد.'],instructor:['مساحة المدرّب','جاهز تلهم اليوم؟','03','أساسيات البرمجة','دوراتك ومحاضراتك ومجموعاتك، عشان تركّز على التعليم.'],student:['مساحة الطالب','كل خطوة تقرّبك.','02','اللغة الإنجليزية','دروسك ومحاضراتك وتقدّمك، في مساحة تخص رحلتك.']};
 all('[data-role]').forEach(b=>b.addEventListener('click',()=>{select(all('[data-role]'),b);const d=roles[b.dataset.role];['previewTitle','previewGreeting','previewCount','previewCourse','roleDescription'].forEach((id,i)=>$('#'+id).textContent=d[i]);}));
 const steps=[['مساحتك تبدأ بكود أكاديميتك.','استخدم الكود والبريد وكلمة المرور اللي استلمتها من مسؤول الأكاديمية للدخول.'],['رتّب الأساس من البداية.','أكمل بيانات الأكاديمية، وأضف الفروع واضبط الإعدادات المناسبة لطريقة عملك.'],['كل شخص في دوره المناسب.','أضف فريق الإدارة والمدرّبين والطلاب، وحدّد صلاحية كل مستخدم.'],['أول دورة، أول إنجاز.','أضف الدورات والمجموعات والدروس، وجهّز جدول المحاضرات لطلابك.'],['شوف نتيجة شغلك.','تابع الحضور والمدفوعات والتقارير، واستخدم بياناتك لتحسين تجربة التعليم.']];
 all('[data-step]').forEach(b=>b.addEventListener('click',()=>{const i=Number(b.dataset.step);select(all('[data-step]'),b);$('#stepNumber').textContent='0'+(i+1);$('#stepTitle').textContent=steps[i][0];$('#stepText').textContent=steps[i][1];}));
 const locations=[['01 / حضوري','مسقط','فرع رئيسي يجمع الإدارة والدورات الحضورية في مساحة واحدة.'],['02 / فروع مترابطة','نزوى','فرع إضافي يتابع طلابه ومجموعاته، مع رؤية موحّدة لإدارة الأكاديمية.'],['03 / عن بُعد','صلالة','طلاب ينضمّوا لمحاضراتهم عبر Zoom ويتابعوا الدروس من مساحتهم.']];
 all('[data-location]').forEach(b=>b.addEventListener('click',()=>{select(all('[data-location]'),b);const d=locations[Number(b.dataset.location)];['locationType','locationTitle','locationText'].forEach((id,i)=>$('#'+id).textContent=d[i]);}));
 let paused=reduced, activityVisible=false;const activityButton=$('#activityToggle');
 function updateActivityButton(){activityButton.setAttribute('aria-pressed',String(paused));activityButton.textContent=paused?'تشغيل ▷':'إيقاف Ⅱ';activityButton.setAttribute('aria-label',paused?'تشغيل المعاينة المتحركة':'إيقاف المعاينة المتحركة');}updateActivityButton();
 activityButton.addEventListener('click',()=>{paused=!paused;updateActivityButton();});
 const events=[['◎','انضم خالد للدورة','التصميم · المجموعة A'],['✓','اكتمل درس جديد','دورة البرمجة · المسار الأول'],['↗','تسجيل دفعة جديدة','30.000 ر.ع · رسوم دورة'],['▥','تم إنشاء تقرير','ملخّص الحضور اليومي']];let eventIndex=0;
 setInterval(()=>{if(paused||document.hidden||!activityVisible)return;const d=events[eventIndex++%events.length];const li=document.createElement('li'),icon=document.createElement('span'),content=document.createElement('div'),b=document.createElement('b'),small=document.createElement('small'),time=document.createElement('time');icon.className='event-icon';icon.textContent=d[0];b.textContent=d[1];small.textContent=d[2];time.textContent='الآن';content.append(b,small);li.append(icon,content,time);li.classList.add('revealed');const list=$('#activityList');list.prepend(li);while(list.children.length>4)list.lastElementChild.remove();},7000);
 if('IntersectionObserver'in window){const ob=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){if(!reduced)e.target.classList.add('revealed');ob.unobserve(e.target);}}),{threshold:.15});all('.section-heading,.product-copy,.trust-statement').forEach(el=>ob.observe(el));new IntersectionObserver(es=>{activityVisible=es[0].isIntersecting;}).observe($('.activity'));
 const counterObserver=new IntersectionObserver(es=>{if(!es[0].isIntersecting)return;counterObserver.disconnect();if(reduced)return;const el=$('#attendanceMetric'),start=performance.now();function frame(now){if(!document.querySelector('[data-period="week"].active'))return;const t=Math.min(1,(now-start)/900);el.textContent=Math.round(92*(1-Math.pow(1-t,3)));if(t<1)requestAnimationFrame(frame);}requestAnimationFrame(frame);});counterObserver.observe($('#attendanceMetric'));}
 else activityVisible=true;
})();
