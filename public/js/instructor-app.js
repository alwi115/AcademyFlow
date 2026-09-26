window.InstructorPortal = (() => {
  let user = null;
  try { user = JSON.parse(localStorage.getItem('af_user') || 'null'); } catch {}

  if (!user || user.role !== 'instructor') {
    location.replace('/academy/login.html');
    return {};
  }

  const page = document.body.dataset.page || 'dashboard';
  let optionsCache = null;
  let toastTimer = null;

  const meta = {
    dashboard:['لوحة المدرب','ملخص دوراتك وطلابك وما يحتاج متابعتك.'],
    courses:['دوراتي','الدورات المسندة لك ونسب تقدم الطلاب.'],
    lessons:['الدروس','أضف وعدّل الدروس وروابط YouTube.'],
    groups:['المجموعات','المجموعات المرتبطة بدوراتك.'],
    students:['طلابي','الطلاب المسجلون في دوراتك ومجموعاتك.'],
    attendance:['الحضور','الحضور اليدوي وسجلات التحضير.'],
    assignments:['الواجبات','إنشاء الواجبات وتصحيح تسليمات الطلاب.'],
    quizzes:['الاختبارات','إنشاء الاختبارات ومتابعة المحاولات.'],
    'quiz-builder':['منشئ الاختبار','الأسئلة والمحاولات والتصحيح اليدوي.'],
    live:['المحاضرات المباشرة','Zoom والتحضير التلقائي للحضور.'],
    grades:['دفتر الدرجات','ملخص تقدم الطالب ودرجات الاختبارات والواجبات.'],
    notifications:['إعلانات الطلاب','أرسل إعلانًا لطلاب دورة محددة.'],
    profile:['حسابي','بيانات المدرب وأمان الحساب.']
  };

  const navGroups = [
    {label:'الرئيسية',items:[['dashboard','الرئيسية','⌂']]},
    {label:'التعليم',items:[
      ['courses','دوراتي','C'],
      ['lessons','الدروس','▶'],
      ['groups','المجموعات','G'],
      ['live','المحاضرات','Z'],
      ['assignments','الواجبات','A'],
      ['quizzes','الاختبارات','Q']
    ]},
    {label:'الطلاب',items:[
      ['students','طلابي','S'],
      ['attendance','الحضور','✓'],
      ['grades','دفتر الدرجات','R']
    ]},
    {label:'التواصل والحساب',items:[
      ['notifications','الإعلانات','N'],
      ['profile','حسابي','U']
    ]}
  ];

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#039;');
  }

  function fmtDate(value, withTime=false) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return withTime
      ? d.toLocaleString('ar-OM',{dateStyle:'medium',timeStyle:'short'})
      : d.toLocaleDateString('ar-OM',{dateStyle:'medium'});
  }

  function fmtDuration(seconds) {
    seconds = Number(seconds || 0);
    if (!seconds) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return (h ? h+' س ' : '') + m + ' د';
  }

  function status(value) {
    const map = {
      active:['نشط','good'], completed:['مكتمل','good'], published:['منشور','good'],
      graded:['مصحح','good'], present:['حاضر','good'], live:['مباشر','good'],
      draft:['مسودة','warn'], planned:['مخطط','warn'], submitted:['بانتظار التصحيح','warn'],
      late:['متأخر','warn'], scheduled:['مجدول','warn'], paused:['متوقف مؤقتًا','warn'],
      absent:['غائب','bad'], cancelled:['ملغي','bad'], closed:['مغلق','bad'],
      excused:['بعذر','info'], ended:['منتهية','info'], pending_review:['تحتاج تصحيح','warn']
    };
    const item = map[value] || [value || '—','info'];
    return '<span class="instructor-status '+item[1]+'">'+esc(item[0])+'</span>';
  }

  async function api(url, options={}) {
    const response = await fetch(url,{
      ...options,
      credentials:'same-origin',
      headers:{
        ...(options.body ? {'Content-Type':'application/json'} : {}),
        ...(options.headers || {})
      }
    });

    if (response.status === 401 || response.status === 403) {
      if (response.status === 401) {
        localStorage.removeItem('af_user');
        location.replace('/academy/login.html');
      }
    }

    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    if (!response.ok) throw new Error(data?.message || 'تعذر تنفيذ العملية');
    return data;
  }

  async function getOptions(force=false) {
    if (!optionsCache || force) {
      optionsCache = await api('/api/instructor/options');
    }
    return optionsCache;
  }

  function toast(message,type='ok') {
    const box = document.getElementById('instructorToast');
    if (!box) return;
    box.textContent = message;
    box.classList.toggle('error',type==='error');
    box.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>box.classList.remove('show'),2600);
  }

  function navHtml() {
    return navGroups.map(group=>{
      const items = group.items.map(item=>{
        const active = item[0]===page ||
          (page==='quiz-builder' && item[0]==='quizzes');
        return '<a class="'+(active?'active':'')+'" href="/instructor/'+item[0]+'.html"><span class="instructor-nav-icon">'+esc(item[2])+'</span>'+esc(item[1])+'</a>';
      }).join('');
      return '<div class="instructor-nav-title">'+esc(group.label)+'</div><nav class="instructor-nav">'+items+'</nav>';
    }).join('');
  }

  function renderShell() {
    const root = document.getElementById('instructorApp');
    const m = meta[page] || ['بوابة المدرب',''];

    root.innerHTML = `
      <div class="instructor-layout">
        <aside class="instructor-sidebar" id="instructorSidebar">
          <a class="brand" href="/instructor/dashboard.html">
            <span class="brand-badge">AF</span>
            <span class="brand-text"><b>AcademyFlow</b><small>INSTRUCTOR PORTAL</small></span>
          </a>
          ${navHtml()}
          <div class="instructor-sidebar-card">
            <small>المدرب</small>
            <b>${esc(user.name || 'Instructor')}</b>
          </div>
        </aside>

        <div class="instructor-overlay" id="instructorOverlay"></div>

        <main class="instructor-main">
          <div class="instructor-content">
            <header class="instructor-topbar">
              <div style="display:flex;gap:9px;align-items:flex-start;min-width:0">
                <button class="instructor-menu-btn" id="instructorMenuButton" type="button">☰</button>
                <div class="instructor-heading">
                  <span class="instructor-eyebrow">INSTRUCTOR PORTAL</span>
                  <h1>${esc(m[0])}</h1>
                  <p>${esc(m[1])}</p>
                </div>
              </div>
              <div class="instructor-top-actions">
                <button class="theme-toggle" data-theme-toggle data-theme-icon type="button">◐</button>
                <div class="instructor-user">
                  <span class="instructor-avatar">${esc((user.name||'IN').slice(0,2).toUpperCase())}</span>
                  <span><b>${esc(user.name||'المدرب')}</b><span>${esc(user.email||'')}</span></span>
                </div>
                <button class="btn ghost" id="instructorLogout" type="button">خروج ↗</button>
              </div>
            </header>

            <section id="pageContent"></section>
            <div class="instructor-footer">AcademyFlow · Instructor Portal</div>
          </div>
        </main>
      </div>

      <section class="instructor-modal" id="instructorModal" hidden>
        <div class="instructor-modal-card">
          <div class="instructor-modal-head">
            <div><h2 id="instructorModalTitle">إجراء</h2><p id="instructorModalSubtitle"></p></div>
            <button class="icon-btn" id="instructorModalClose" type="button">×</button>
          </div>
          <form id="instructorModalForm" class="instructor-form-grid"></form>
        </div>
      </section>

      <section class="instructor-modal" id="academyModal" hidden>
        <div class="instructor-modal-card">
          <div class="instructor-modal-head">
            <div><h2 id="academyModalTitle">إجراء</h2><p id="academyModalSubtitle"></p></div>
            <button class="icon-btn" id="academyModalClose" type="button">×</button>
          </div>
          <form id="academyModalForm" class="instructor-form-grid"></form>
        </div>
      </section>

      <div class="instructor-toast" id="instructorToast"></div>
    `;

    const sidebar = document.getElementById('instructorSidebar');
    const overlay = document.getElementById('instructorOverlay');
    const closeMenu = () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
    };

    document.getElementById('instructorMenuButton').onclick = () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('show');
    };
    overlay.onclick = closeMenu;
    document.querySelectorAll('.instructor-nav a').forEach(a=>a.addEventListener('click',closeMenu));

    document.getElementById('instructorLogout').onclick = async () => {
      try { await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'}); } catch {}
      localStorage.removeItem('af_user');
      location.replace('/academy/login.html');
    };

    const modal = document.getElementById('instructorModal');
    document.getElementById('instructorModalClose').onclick = ()=>modal.hidden=true;
    modal.addEventListener('click',e=>{if(e.target===modal)modal.hidden=true;});

    const academyModal = document.getElementById('academyModal');
    document.getElementById('academyModalClose').onclick = ()=>academyModal.hidden=true;
    academyModal.addEventListener('click',e=>{if(e.target===academyModal)academyModal.hidden=true;});
  }

  function openForm({title,subtitle='',fields=[],values={},submitLabel='حفظ',onSubmit}) {
    const modal = document.getElementById('instructorModal');
    const form = document.getElementById('instructorModalForm');
    document.getElementById('instructorModalTitle').textContent = title;
    document.getElementById('instructorModalSubtitle').textContent = subtitle;

    form.innerHTML = fields.map(f=>{
      const value = values[f.name] ?? '';
      const cls = f.full ? 'field full' : 'field';

      if (f.type==='select') {
        return '<div class="'+cls+'"><label>'+esc(f.label)+'</label><select name="'+esc(f.name)+'" '+(f.required?'required':'')+'>'+
          (f.placeholder?'<option value="">'+esc(f.placeholder)+'</option>':'')+
          (f.options||[]).map(o=>'<option value="'+esc(o[0])+'" '+(String(o[0])===String(value)?'selected':'')+'>'+esc(o[1])+'</option>').join('')+
          '</select></div>';
      }

      if (f.type==='textarea') {
        return '<div class="'+cls+'"><label>'+esc(f.label)+'</label><textarea name="'+esc(f.name)+'" '+(f.required?'required':'')+'>'+esc(value)+'</textarea></div>';
      }

      if (f.type==='checkbox') {
        return '<label class="instructor-note full"><input name="'+esc(f.name)+'" type="checkbox" '+(value?'checked':'')+'> '+esc(f.label)+'</label>';
      }

      return '<div class="'+cls+'"><label>'+esc(f.label)+'</label><input name="'+esc(f.name)+'" type="'+esc(f.type||'text')+'" value="'+esc(value)+'" '+(f.required?'required':'')+' '+(f.min!==undefined?'min="'+esc(f.min)+'"':'')+' '+(f.max!==undefined?'max="'+esc(f.max)+'"':'')+'></div>';
    }).join('')+
    '<div class="instructor-form-message" id="instructorFormMessage"></div>'+
    '<div class="instructor-form-actions"><button class="btn ghost" id="instructorFormCancel" type="button">إلغاء</button><button class="btn primary" type="submit">'+esc(submitLabel)+'</button></div>';

    modal.hidden=false;
    document.getElementById('instructorFormCancel').onclick=()=>modal.hidden=true;

    form.onsubmit=async e=>{
      e.preventDefault();
      const btn=form.querySelector('button[type="submit"]');
      const msg=document.getElementById('instructorFormMessage');
      const original=btn.textContent;
      const data=Object.fromEntries(new FormData(form).entries());

      fields.filter(f=>f.type==='checkbox').forEach(f=>{
        data[f.name]=form.elements[f.name].checked;
      });

      btn.disabled=true;btn.textContent='جاري الحفظ...';msg.textContent='';
      try{
        await onSubmit(data);
        modal.hidden=true;
      }catch(err){msg.textContent=err.message;}
      finally{btn.disabled=false;btn.textContent=original;}
    };
  }

  function kpi(label,value) {
    return '<article class="instructor-kpi"><small>'+esc(label)+'</small><strong>'+esc(value ?? 0)+'</strong></article>';
  }

  function progress(value) {
    const n=Math.max(0,Math.min(100,Number(value||0)));
    return '<div class="instructor-progress"><i style="width:'+n+'%"></i></div><div class="instructor-progress-caption"><span>التقدم</span><b>'+n+'%</b></div>';
  }

  async function renderDashboard() {
    const target=document.getElementById('pageContent');
    target.innerHTML='<div class="instructor-empty">جاري تحميل لوحة المدرب...</div>';

    try{
      const d=await api('/api/instructor/dashboard');
      target.innerHTML=`
        <section class="instructor-kpis">
          ${kpi('دوراتي',d.courses)}
          ${kpi('طلابي',d.students)}
          ${kpi('متوسط التقدم',d.averageProgress+'%')}
          ${kpi('تحتاج تصحيح',Number(d.pendingAssignments||0)+Number(d.pendingQuizReviews||0))}
        </section>
        <section class="instructor-grid-2">
          <article class="instructor-card">
            <div class="instructor-card-head"><div><h2>المحاضرات القادمة</h2><p>أقرب جلسات Zoom.</p></div><a class="btn soft" href="/instructor/live.html">عرض الكل</a></div>
            <div class="instructor-list">
              ${d.upcomingLive.length?d.upcomingLive.map(x=>'<div class="instructor-list-row"><div><b>'+esc(x.title)+'</b><span>'+esc(x.course?.title||'')+' · '+fmtDate(x.startAt,true)+'</span></div>'+status(x.status)+'</div>').join(''):'<div class="instructor-empty">لا توجد محاضرات قادمة.</div>'}
            </div>
          </article>
          <article class="instructor-card">
            <div class="instructor-card-head"><div><h2>آخر تسليمات الواجبات</h2><p>تسليمات تحتاج انتباهك.</p></div><a class="btn soft" href="/instructor/assignments.html">الواجبات</a></div>
            <div class="instructor-list">
              ${d.recentSubmissions.length?d.recentSubmissions.map(x=>'<div class="instructor-list-row"><div><b>'+esc(x.studentId?.name||'طالب')+'</b><span>'+esc(x.assessmentId?.title||'واجب')+' · '+esc(x.courseId?.title||'')+'</span></div>'+status(x.status)+'</div>').join(''):'<div class="instructor-empty">لا توجد تسليمات حديثة.</div>'}
            </div>
          </article>
        </section>
      `;
    }catch(err){target.innerHTML='<div class="instructor-card instructor-empty">'+esc(err.message)+'</div>';}
  }

  async function renderCourses() {
    const target=document.getElementById('pageContent');
    target.innerHTML='<div class="instructor-empty">جاري تحميل الدورات...</div>';
    try{
      const rows=await api('/api/instructor/courses');
      target.innerHTML=rows.length?'<div class="instructor-course-grid">'+rows.map(c=>`
        <article class="instructor-course">
          <h3>${esc(c.title)}</h3>
          <p>${esc(c.description||'بدون وصف.')}</p>
          <div class="instructor-meta"><span>${esc(c.code||'بدون كود')}</span><span>${esc(c.deliveryType)}</span><span>${esc(c.studentCount)} طالب</span><span>${esc(c.lessonCount)} درس</span></div>
          ${progress(c.averageProgress)}
        </article>
      `).join('')+'</div>':'<div class="instructor-card instructor-empty">لا توجد دورات مسندة لك.</div>';
    }catch(err){target.innerHTML='<div class="instructor-card instructor-empty">'+esc(err.message)+'</div>';}
  }

  async function renderGroups() {
    const target=document.getElementById('pageContent');
    target.innerHTML='<div class="instructor-empty">جاري تحميل المجموعات...</div>';
    try{
      const rows=await api('/api/instructor/groups');
      target.innerHTML='<section class="instructor-card"><div class="instructor-card-head"><div><h2>مجموعاتي</h2><p>المجموعات التابعة لدوراتك.</p></div></div><div class="instructor-list">'+
        (rows.length?rows.map(g=>'<div class="instructor-list-row"><div><b>'+esc(g.name)+'</b><span>'+esc(g.courseId?.title||'')+' · '+esc(g.schedule||'بدون جدول')+' · '+esc(g.room||'بدون قاعة')+'</span></div>'+status(g.status)+'</div>').join(''):'<div class="instructor-empty">لا توجد مجموعات.</div>')+
        '</div></section>';
    }catch(err){target.innerHTML='<div class="instructor-card instructor-empty">'+esc(err.message)+'</div>';}
  }

  async function renderStudents() {
    const target=document.getElementById('pageContent');
    target.innerHTML='<div class="instructor-empty">جاري تحميل الطلاب...</div>';
    try{
      const rows=await api('/api/instructor/students');
      target.innerHTML=`
        <section class="instructor-card">
          <div class="instructor-card-head"><div><h2>طلاب دوراتك</h2><p>لا تظهر لك إلا تسجيلات الدورات المسندة لك.</p></div><input class="instructor-search" id="studentSearch" placeholder="بحث..."></div>
          <div id="studentRows"></div>
        </section>`;

      const draw=()=>{
        const q=(document.getElementById('studentSearch').value||'').toLowerCase();
        const filtered=q?rows.filter(x=>JSON.stringify(x).toLowerCase().includes(q)):rows;
        document.getElementById('studentRows').innerHTML='<div class="instructor-table-wrap"><table class="instructor-table"><thead><tr><th>الطالب</th><th>الدورة</th><th>المجموعة</th><th>الحالة</th><th>التقدم</th><th>آخر دخول</th></tr></thead><tbody>'+
        (filtered.length?filtered.map(x=>'<tr><td><b>'+esc(x.studentId?.name||'')+'</b><br><small>'+esc(x.studentId?.email||'')+'</small></td><td>'+esc(x.courseId?.title||'')+'</td><td>'+esc(x.groupId?.name||'—')+'</td><td>'+status(x.status)+'</td><td>'+esc(x.progress||0)+'%</td><td>'+fmtDate(x.studentId?.lastLoginAt,true)+'</td></tr>').join(''):'<tr><td colspan="6" class="instructor-empty">لا توجد نتائج.</td></tr>')+
        '</tbody></table></div>';
      };
      document.getElementById('studentSearch').oninput=draw;draw();
    }catch(err){target.innerHTML='<div class="instructor-card instructor-empty">'+esc(err.message)+'</div>';}
  }

  async function renderGrades() {
    const target=document.getElementById('pageContent');
    target.innerHTML='<div class="instructor-empty">جاري تجهيز دفتر الدرجات...</div>';
    try{
      const rows=await api('/api/instructor/gradebook');
      target.innerHTML='<section class="instructor-card"><div class="instructor-card-head"><div><h2>دفتر الدرجات</h2><p>أفضل نتائج الاختبارات + الواجبات المصححة.</p></div></div><div class="instructor-table-wrap"><table class="instructor-table"><thead><tr><th>الطالب</th><th>الدورة</th><th>التقدم</th><th>الاختبارات</th><th>الواجبات</th><th>المتوسط</th></tr></thead><tbody>'+
        (rows.length?rows.map(x=>'<tr><td><b>'+esc(x.student?.name||'')+'</b><br><small>'+esc(x.student?.email||'')+'</small></td><td>'+esc(x.course?.title||'')+'</td><td>'+esc(x.progress)+'%</td><td>'+gradeCell(x.quizAverage)+'</td><td>'+gradeCell(x.assignmentAverage)+'</td><td>'+gradeCell(x.academicAverage)+'</td></tr>').join(''):'<tr><td colspan="6" class="instructor-empty">لا توجد درجات حتى الآن.</td></tr>')+
        '</tbody></table></div></section>';
    }catch(err){target.innerHTML='<div class="instructor-card instructor-empty">'+esc(err.message)+'</div>';}
  }

  function gradeCell(value) {
    if (value===null || value===undefined) return '—';
    const cls=value>=80?'good':value>=60?'warn':'bad';
    return '<span class="instructor-grade '+cls+'">'+esc(value)+'%</span>';
  }

  async function renderNotifications() {
    const target=document.getElementById('pageContent');
    const load=async()=>{
      target.innerHTML='<div class="instructor-empty">جاري تحميل الإعلانات...</div>';
      try{
        const rows=await api('/api/instructor/notifications');
        target.innerHTML='<section class="instructor-card"><div class="instructor-card-head"><div><h2>إعلانات الطلاب</h2><p>الإعلان يصل فقط لطلاب الدورة المحددة.</p></div><button class="btn primary" id="notificationAdd" type="button">+ إعلان</button></div><div class="instructor-list">'+
          (rows.length?rows.map(n=>'<div class="instructor-list-row"><div><b>'+esc(n.title)+'</b><span>'+esc(n.courseId?.title||'عام')+' · '+fmtDate(n.sentAt||n.createdAt,true)+'</span><small>'+esc(n.message)+'</small></div>'+status(n.status)+'</div>').join(''):'<div class="instructor-empty">لا توجد إعلانات.</div>')+
          '</div></section>';
        document.getElementById('notificationAdd').onclick=()=>openNotification(load);
      }catch(err){target.innerHTML='<div class="instructor-card instructor-empty">'+esc(err.message)+'</div>';}
    };
    await load();
  }

  async function openNotification(onDone) {
    const opts=await getOptions();
    openForm({
      title:'إعلان جديد',
      subtitle:'سيظهر لطلاب الدورة داخل بوابة الطالب.',
      fields:[
        {name:'courseId',label:'الدورة',type:'select',required:true,placeholder:'اختر الدورة...',options:opts.courses.map(x=>[x._id,x.title])},
        {name:'title',label:'العنوان',required:true},
        {name:'message',label:'الرسالة',type:'textarea',required:true,full:true}
      ],
      submitLabel:'إرسال الإعلان',
      onSubmit:async data=>{
        await api('/api/instructor/notifications',{method:'POST',body:JSON.stringify(data)});
        toast('تم إرسال الإعلان');await onDone();
      }
    });
  }

  async function renderProfile() {
    const target=document.getElementById('pageContent');
    target.innerHTML='<div class="instructor-empty">جاري تحميل الحساب...</div>';
    try{
      const data=await api('/api/instructor/profile');
      target.innerHTML=`
        <section class="instructor-grid-2">
          <article class="instructor-card">
            <div class="instructor-card-head"><div><h2>بيانات المدرب</h2><p>${esc(data.academy?.name||'')}</p></div></div>
            <form id="instructorProfileForm">
              <div class="field"><label>الاسم</label><input name="name" value="${esc(data.user.name||'')}" required></div>
              <div class="field"><label>البريد</label><input value="${esc(data.user.email||'')}" disabled></div>
              <div class="field"><label>الهاتف</label><input name="phone" value="${esc(data.user.phone||'')}"></div>
              <button class="btn primary" type="submit">حفظ البيانات</button>
            </form>
          </article>
          <article class="instructor-card">
            <div class="instructor-card-head"><div><h2>أمان الحساب</h2><p>غيّر كلمة المرور من هنا.</p></div></div>
            <button class="btn secondary" id="instructorPassword" type="button">تغيير كلمة المرور</button>
          </article>
        </section>`;

      document.getElementById('instructorProfileForm').onsubmit=async e=>{
        e.preventDefault();
        const data2=Object.fromEntries(new FormData(e.currentTarget).entries());
        const saved=await api('/api/instructor/profile',{method:'PATCH',body:JSON.stringify(data2)});
        user.name=saved.name;localStorage.setItem('af_user',JSON.stringify(user));toast('تم حفظ البيانات');
      };
      document.getElementById('instructorPassword').onclick=()=>openForm({
        title:'تغيير كلمة المرور',
        fields:[
          {name:'currentPassword',label:'كلمة المرور الحالية',type:'password',required:true},
          {name:'newPassword',label:'كلمة المرور الجديدة',type:'password',required:true}
        ],
        onSubmit:async data2=>{
          await api('/api/instructor/profile/password',{method:'POST',body:JSON.stringify(data2)});
          toast('تم تغيير كلمة المرور');
        }
      });
    }catch(err){target.innerHTML='<div class="instructor-card instructor-empty">'+esc(err.message)+'</div>';}
  }

  async function init() {
    renderShell();

    if (page==='dashboard') return renderDashboard();
    if (page==='courses') return renderCourses();
    if (page==='groups') return renderGroups();
    if (page==='students') return renderStudents();
    if (page==='grades') return renderGrades();
    if (page==='notifications') return renderNotifications();
    if (page==='profile') return renderProfile();

    if (page==='lessons' && window.InstructorTeaching) return window.InstructorTeaching.renderLessons();
    if (page==='attendance' && window.InstructorTeaching) return window.InstructorTeaching.renderAttendance();
    if (page==='assignments' && window.InstructorTeaching) return window.InstructorTeaching.renderAssignments();
    if (page==='live' && window.InstructorLive) return window.InstructorLive.render();

    if (page==='quizzes' && window.AcademyQuizAdmin) return window.AcademyQuizAdmin.renderList();
    if (page==='quiz-builder' && window.AcademyQuizAdmin) return window.AcademyQuizAdmin.renderBuilder();

    document.getElementById('pageContent').innerHTML='<div class="instructor-card instructor-empty">الصفحة غير موجودة.</div>';
  }

  document.addEventListener('DOMContentLoaded',init);

  return {
    api,getOptions,openForm,toast,esc,fmtDate,fmtDuration,status,progress,user
  };
})();