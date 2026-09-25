const AF = (() => {
  const token = localStorage.getItem('af_token');
  let user = null;
  try { user = JSON.parse(localStorage.getItem('af_user') || 'null'); } catch {}

  if (!token || !user || user.role === 'superadmin') {
    location.href = '/academy/login.html';
    return {};
  }

  const page = document.body.dataset.page || 'dashboard';
  const optionsCache = { value: null };

  const roleLabels = {
    owner: 'مالك الأكاديمية',
    admin: 'مدير',
    branch_manager: 'مدير فرع',
    instructor: 'مدرب',
    accountant: 'محاسب',
    reception: 'استقبال',
    content_manager: 'إدارة محتوى',
    support: 'دعم',
    student: 'طالب'
  };

  const navGroups = [
    {
      label: 'الرئيسية',
      items: [
        ['dashboard','لوحة التحكم','⌂'],
        ['calendar','التقويم','CAL']
      ]
    },
    {
      label: 'التعليم',
      items: [
        ['courses','الدورات','C'],
        ['lessons','الدروس والفيديو','▶'],
        ['groups','المجموعات','G'],
        ['live','المحاضرات المباشرة','Z'],
        ['quizzes','الاختبارات','Q'],
        ['assignments','الواجبات','A']
      ]
    },
    {
      label: 'الأشخاص',
      items: [
        ['students','الطلاب','S'],
        ['instructors','المدربين','I'],
        ['staff','الموظفين','T', ['owner','admin']],
        ['enrollments','التسجيلات','E'],
        ['attendance','الحضور','✓']
      ]
    },
    {
      label: 'الإدارة',
      items: [
        ['branches','الفروع','B'],
        ['payments','المدفوعات','P', ['owner','admin','accountant']],
        ['certificates','الشهادات','C'],
        ['reports','التقارير','R', ['owner','admin','accountant']]
      ]
    },
    {
      label: 'التواصل والنظام',
      items: [
        ['notifications','الإشعارات','N'],
        ['support','الدعم','?'],
        ['settings','الإعدادات','⚙', ['owner','admin']]
      ]
    }
  ];

  const pageMeta = {
    dashboard: ['لوحة التحكم','نظرة شاملة على نشاط الأكاديمية اليوم.'],
    calendar: ['التقويم','المواعيد والمحاضرات القادمة في مكان واحد.'],
    students: ['الطلاب','إدارة حسابات الطلاب وبيانات التواصل.'],
    instructors: ['المدربين','إدارة فريق التدريب والحسابات التعليمية.'],
    staff: ['الموظفين','إدارة موظفي الأكاديمية والصلاحيات التشغيلية.'],
    branches: ['الفروع','تنظيم فروع الأكاديمية وعناوينها وبياناتها.'],
    courses: ['الدورات','إنشاء الدورات وتنظيم نوع التقديم والمدرب والسعر.'],
    lessons: ['الدروس والفيديو','أضف رابط YouTube وسيتم تشغيل الفيديو داخل AcademyFlow.'],
    groups: ['المجموعات','تقسيم الطلاب إلى مجموعات وربطها بالدورات والفروع.'],
    enrollments: ['التسجيلات','ربط الطلاب بالدورات والمجموعات ومتابعة الحالة.'],
    attendance: ['الحضور','تسجيل الحضور والغياب والتأخير لكل طالب.'],
    quizzes: ['الاختبارات','إنشاء اختبارات مرتبطة بالدورات ومواعيدها.'],
    assignments: ['الواجبات','تنظيم الواجبات ومواعيد التسليم والدرجات.'],
    live: ['المحاضرات المباشرة','جدولة جلسات Zoom وربطها بالدورات والمدربين.'],
    payments: ['المدفوعات','تسجيل الدفعات ومتابعة حالة التحصيل.'],
    certificates: ['الشهادات','إصدار شهادات مرتبطة بالطلاب والدورات.'],
    reports: ['التقارير','ملخص الأداء والإيرادات والحضور والتسجيلات.'],
    notifications: ['الإشعارات','إرسال تنبيهات داخلية للفئات المختلفة.'],
    support: ['الدعم','فتح ومتابعة طلبات الدعم الخاصة بالأكاديمية.'],
    settings: ['الإعدادات','بيانات الأكاديمية والهوية والتفضيلات العامة.']
  };

  function allowed(roles) {
    return !roles || roles.includes(user.role);
  }

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#039;');
  }

  function val(obj, path) {
    return path.split('.').reduce((x, key) => x && x[key], obj);
  }

  function fmtDate(value, withTime = false) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return esc(value);
    return withTime
      ? date.toLocaleString('ar-OM', { dateStyle: 'medium', timeStyle: 'short' })
      : date.toLocaleDateString('ar-OM', { dateStyle: 'medium' });
  }

  function fmtMoney(value, currency = 'OMR') {
    return new Intl.NumberFormat('en-OM', {
      style: 'currency',
      currency,
      maximumFractionDigits: 3
    }).format(Number(value || 0));
  }

  function status(value) {
    const good = ['active','paid','published','issued','sent','present','completed','live'];
    const warn = ['trial','planned','pending','draft','late','paused','scheduled','in_progress'];
    const bad = ['frozen','suspended','failed','refunded','cancelled','absent','revoked','closed'];
    const labels = {
      active:'نشط', paid:'مدفوع', published:'منشور', issued:'صادرة', sent:'مرسل',
      present:'حاضر', completed:'مكتمل', live:'مباشر', trial:'تجريبي', planned:'مخطط',
      pending:'معلق', draft:'مسودة', late:'متأخر', paused:'متوقف مؤقتًا', scheduled:'مجدول',
      in_progress:'قيد العمل', frozen:'موقوف', suspended:'معلق', failed:'فشل',
      refunded:'مسترجع', cancelled:'ملغي', absent:'غائب', revoked:'ملغاة', closed:'مغلق',
      excused:'بعذر', open:'مفتوح', archived:'مؤرشف'
    };
    const cls = good.includes(value) ? 'good' : bad.includes(value) ? 'bad' : warn.includes(value) ? 'warn' : 'info';
    return '<span class="academy-status '+cls+'">'+esc(labels[value] || value || '—')+'</span>';
  }

  async function api(url, options = {}) {
    const headers = {
      Authorization: 'Bearer ' + token,
      ...(options.body ? {'Content-Type':'application/json'} : {}),
      ...(options.headers || {})
    };

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401 || response.status === 403) {
      if (response.status === 401) {
        localStorage.removeItem('af_token');
        localStorage.removeItem('af_user');
        location.href = '/academy/login.html';
        throw new Error('Unauthorized');
      }
    }

    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    if (!response.ok) {
      const error = new Error(data?.message || 'تعذر تنفيذ العملية');
      error.status = response.status;
      throw error;
    }

    return data;
  }

  function href(name) {
    return '/academy/' + name + '.html';
  }

  function renderNav() {
    return navGroups.map(group => {
      const items = group.items
        .filter(item => allowed(item[3]))
        .map(item => {
          const active = item[0] === page ? 'active' : '';
          return '<a class="'+active+'" href="'+href(item[0])+'"><span class="academy-nav-icon">'+esc(item[2])+'</span>'+esc(item[1])+'</a>';
        }).join('');

      if (!items) return '';
      return '<div class="academy-nav-section">'+esc(group.label)+'</div><nav class="academy-nav">'+items+'</nav>';
    }).join('');
  }

  function renderShell() {
    const root = document.getElementById('academyApp');
    const meta = pageMeta[page] || ['AcademyFlow',''];
    root.innerHTML = `
      <div class="academy-layout">
        <aside class="academy-sidebar" id="academySidebar">
          <a class="brand" href="/academy/dashboard.html">
            <span class="brand-badge">AF</span>
            <span class="brand-text"><b>AcademyFlow</b><small>ACADEMY WORKSPACE</small></span>
          </a>
          ${renderNav()}
          <div class="academy-sidebar-footer">
            <b style="display:block;color:var(--text);margin-bottom:3px">${esc(user.name || 'Academy User')}</b>
            ${esc(roleLabels[user.role] || user.role)}<br>
            <span>مساحة الأكاديمية محمية ومعزولة.</span>
          </div>
        </aside>

        <div class="academy-overlay" id="academyOverlay"></div>

        <main class="academy-main">
          <div class="academy-content">
            <header class="academy-topbar">
              <div style="display:flex;gap:10px;align-items:flex-start;min-width:0">
                <button class="academy-mobile-menu" id="academyMenuButton" type="button">☰</button>
                <div class="academy-heading">
                  <span class="eyebrow">ACADEMYFLOW</span>
                  <h1>${esc(meta[0])}</h1>
                  <p>${esc(meta[1])}</p>
                </div>
              </div>
              <div class="academy-toolbar">
                <button class="theme-toggle" type="button" onclick="toggleTheme()" title="تبديل الوضع">◐</button>
                <div class="academy-user">
                  <span class="academy-user-avatar">${esc((user.name || 'AF').slice(0,2).toUpperCase())}</span>
                  <span><b>${esc(user.name || 'المستخدم')}</b><span>${esc(roleLabels[user.role] || user.role)}</span></span>
                </div>
                <button class="btn ghost" type="button" id="academyLogout"><span class="hide-phone">خروج</span> ↗</button>
              </div>
            </header>

            <section id="pageContent"></section>
            <div class="academy-footer">AcademyFlow · Academy Management Workspace</div>
          </div>
        </main>
      </div>

      <section class="academy-modal" id="academyModal" hidden>
        <div class="academy-modal-card">
          <div class="academy-modal-head">
            <div><h2 id="academyModalTitle">إضافة</h2><p id="academyModalSubtitle"></p></div>
            <button class="icon-btn" type="button" id="academyModalClose">×</button>
          </div>
          <form id="academyModalForm" class="academy-form-grid"></form>
        </div>
      </section>
    `;

    const sidebar = document.getElementById('academySidebar');
    const overlay = document.getElementById('academyOverlay');
    const closeSidebar = () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
    };

    document.getElementById('academyMenuButton').onclick = () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('show');
    };
    overlay.onclick = closeSidebar;
    document.querySelectorAll('.academy-nav a').forEach(a => a.addEventListener('click', closeSidebar));

    document.getElementById('academyLogout').onclick = () => {
      localStorage.removeItem('af_token');
      localStorage.removeItem('af_user');
      location.href = '/academy/login.html';
    };

    const modal = document.getElementById('academyModal');
    document.getElementById('academyModalClose').onclick = () => modal.hidden = true;
    modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });
  }

  async function getOptions() {
    if (!optionsCache.value) {
      optionsCache.value = await api('/api/academy/options');
    }
    return optionsCache.value;
  }

  const staticOptions = {
    userRole: [
      ['admin','مدير'],['branch_manager','مدير فرع'],['accountant','محاسب'],
      ['reception','استقبال'],['content_manager','إدارة محتوى'],['support','دعم']
    ],
    deliveryType: [['recorded','مسجلة'],['live','مباشرة'],['in_person','حضورية'],['hybrid','هجين']],
    courseStatus: [['draft','مسودة'],['active','نشطة'],['archived','مؤرشفة']],
    groupStatus: [['planned','مخطط'],['active','نشطة'],['completed','مكتملة'],['cancelled','ملغاة']],
    enrollmentStatus: [['active','نشط'],['completed','مكتمل'],['paused','متوقف مؤقتًا'],['cancelled','ملغي']],
    attendanceStatus: [['present','حاضر'],['absent','غائب'],['late','متأخر'],['excused','بعذر']],
    assessmentStatus: [['draft','مسودة'],['published','منشور'],['closed','مغلق']],
    lessonStatus: [['draft','مسودة'],['published','منشور']],
    paymentMethod: [['cash','نقدي'],['card','بطاقة'],['bank','تحويل بنكي']],
    paymentStatus: [['paid','مدفوع'],['pending','معلق'],['refunded','مسترجع'],['failed','فشل']],
    audience: [['all','الجميع'],['students','الطلاب'],['instructors','المدربين'],['staff','الموظفين']],
    channel: [['in_app','داخل النظام'],['email','البريد الإلكتروني'],['whatsapp','واتساب']],
    notificationStatus: [['sent','إرسال الآن'],['draft','حفظ كمسودة']],
    supportCategory: [['technical','تقني'],['billing','الفوترة'],['account','الحساب'],['feature','اقتراح ميزة'],['other','أخرى']],
    priority: [['low','منخفضة'],['normal','عادية'],['high','عالية']]
  };

  const pages = {
    students: {
      endpoint:'/api/academy/users?kind=student',
      createEndpoint:'/api/academy/users',
      createRoles:['owner','admin'],
      title:'إضافة طالب',
      extra:{ role:'student' },
      fields:[
        ['name','اسم الطالب','text',true],
        ['email','البريد الإلكتروني','email',true],
        ['phone','رقم الهاتف','text',false],
        ['password','كلمة مرور مؤقتة','password',true]
      ],
      columns:[
        ['الطالب','name'],['البريد','email'],['الهاتف','phone'],
        ['الحالة','active',v => v ? status('active') : status('suspended')],
        ['تاريخ الإضافة','createdAt',v => fmtDate(v)]
      ]
    },
    instructors: {
      endpoint:'/api/academy/users?kind=instructor',
      createEndpoint:'/api/academy/users',
      createRoles:['owner','admin'],
      title:'إضافة مدرب',
      extra:{ role:'instructor' },
      fields:[
        ['name','اسم المدرب','text',true],['email','البريد الإلكتروني','email',true],
        ['phone','رقم الهاتف','text',false],['password','كلمة مرور مؤقتة','password',true]
      ],
      columns:[
        ['المدرب','name'],['البريد','email'],['الهاتف','phone'],
        ['آخر دخول','lastLoginAt',v => fmtDate(v,true)],['الحالة','active',v => v ? status('active') : status('suspended')]
      ]
    },
    staff: {
      endpoint:'/api/academy/users?kind=staff',
      createEndpoint:'/api/academy/users',
      createRoles:['owner','admin'],
      title:'إضافة موظف',
      fields:[
        ['name','اسم الموظف','text',true],['email','البريد الإلكتروني','email',true],
        ['phone','رقم الهاتف','text',false],['role','الدور','select',true,'userRole'],
        ['password','كلمة مرور مؤقتة','password',true]
      ],
      columns:[
        ['الموظف','name'],['البريد','email'],
        ['الدور','role',v => esc(roleLabels[v] || v)],['الهاتف','phone'],
        ['الحالة','active',v => v ? status('active') : status('suspended')]
      ]
    },
    branches: {
      endpoint:'/api/academy/branches',
      createRoles:['owner','admin','branch_manager'],
      title:'إضافة فرع',
      fields:[
        ['name','اسم الفرع','text',true],['code','كود الفرع','text',true],
        ['city','المدينة','text',false],['phone','رقم الهاتف','text',false],
        ['email','البريد','email',false],['address','العنوان','textarea',false]
      ],
      columns:[
        ['الكود','code'],['الفرع','name'],['المدينة','city'],['الهاتف','phone'],
        ['الحالة','active',v => v ? status('active') : status('suspended')]
      ]
    },
    courses: {
      endpoint:'/api/academy/courses',
      createRoles:['owner','admin','content_manager','instructor'],
      title:'إضافة دورة',
      view:'cards',
      fields:[
        ['title','اسم الدورة','text',true],['code','كود الدورة','text',false],
        ['category','التصنيف','text',false],['deliveryType','نوع الدورة','select',true,'deliveryType'],
        ['instructorId','المدرب','dynamicSelect',false,'instructors'],
        ['price','السعر','number',false],['startAt','تاريخ البداية','date',false],
        ['endAt','تاريخ النهاية','date',false],['status','الحالة','select',true,'courseStatus'],
        ['thumbnailUrl','رابط صورة الغلاف','url',false],['description','الوصف','textarea',false]
      ]
    },
    lessons: {
      endpoint:'/api/academy/lessons',
      createRoles:['owner','admin','content_manager','instructor'],
      title:'إضافة درس',
      view:'videos',
      modalSubtitle:'ألصق رابط YouTube فقط. الفيديو يبقى مستضافًا على YouTube ويُشغل داخل النظام.',
      fields:[
        ['courseId','الدورة','dynamicSelect',true,'courses'],
        ['title','عنوان الدرس','text',true],['order','ترتيب الدرس','number',false],
        ['videoUrl','رابط YouTube','url',false],['durationMinutes','المدة بالدقائق','number',false],
        ['status','الحالة','select',true,'lessonStatus'],['description','وصف الدرس','textarea',false]
      ]
    },
    groups: {
      endpoint:'/api/academy/groups',
      createRoles:['owner','admin','branch_manager'],
      title:'إضافة مجموعة',
      fields:[
        ['name','اسم المجموعة','text',true],['courseId','الدورة','dynamicSelect',true,'courses'],
        ['branchId','الفرع','dynamicSelect',false,'branches'],['instructorId','المدرب','dynamicSelect',false,'instructors'],
        ['schedule','الجدول','text',false],['room','القاعة','text',false],
        ['capacity','السعة','number',false],['startAt','تاريخ البداية','date',false],
        ['endAt','تاريخ النهاية','date',false],['status','الحالة','select',true,'groupStatus']
      ],
      columns:[
        ['المجموعة','name'],['الدورة','courseId.title'],['المدرب','instructorId.name'],
        ['الفرع','branchId.name'],['الجدول','schedule'],['الحالة','status',status]
      ]
    },
    enrollments: {
      endpoint:'/api/academy/enrollments',
      createRoles:['owner','admin','reception','branch_manager'],
      title:'تسجيل طالب في دورة',
      fields:[
        ['studentId','الطالب','dynamicSelect',true,'students'],['courseId','الدورة','dynamicSelect',true,'courses'],
        ['groupId','المجموعة','dynamicSelect',false,'groups'],['status','الحالة','select',true,'enrollmentStatus']
      ],
      columns:[
        ['الطالب','studentId.name'],['الدورة','courseId.title'],['المجموعة','groupId.name'],
        ['التقدم','progress',v => esc(v ?? 0)+'%'],['الحالة','status',status],['التسجيل','enrolledAt',v => fmtDate(v)]
      ]
    },
    attendance: {
      endpoint:'/api/academy/attendance',
      createRoles:['owner','admin','instructor','reception','branch_manager'],
      title:'تسجيل حضور',
      fields:[
        ['studentId','الطالب','dynamicSelect',true,'students'],['courseId','الدورة','dynamicSelect',true,'courses'],
        ['groupId','المجموعة','dynamicSelect',false,'groups'],['date','التاريخ','date',true],
        ['status','الحالة','select',true,'attendanceStatus'],['note','ملاحظة','textarea',false]
      ],
      columns:[
        ['الطالب','studentId.name'],['الدورة','courseId.title'],['المجموعة','groupId.name'],
        ['التاريخ','date',v => fmtDate(v)],['الحالة','status',status],['ملاحظة','note']
      ]
    },
    quizzes: assessmentPage('quiz'),
    assignments: assessmentPage('assignment'),
    payments: {
      endpoint:'/api/academy/payments',
      createRoles:['owner','admin','accountant'],
      title:'إضافة دفعة',
      fields:[
        ['studentId','الطالب','dynamicSelect',true,'students'],['courseId','الدورة','dynamicSelect',false,'courses'],
        ['amount','المبلغ','number',true],['method','طريقة الدفع','select',true,'paymentMethod'],
        ['status','الحالة','select',true,'paymentStatus'],['reference','رقم المرجع','text',false],
        ['paidAt','تاريخ الدفع','date',false],['notes','ملاحظات','textarea',false]
      ],
      columns:[
        ['الطالب','studentId.name'],['الدورة','courseId.title'],
        ['المبلغ','amount',v => fmtMoney(v)],['الطريقة','method'],['الحالة','status',status],
        ['التاريخ','paidAt',v => fmtDate(v)]
      ]
    },
    certificates: {
      endpoint:'/api/academy/certificates',
      createRoles:['owner','admin','content_manager'],
      title:'إصدار شهادة',
      fields:[
        ['studentId','الطالب','dynamicSelect',true,'students'],['courseId','الدورة','dynamicSelect',true,'courses'],
        ['certificateNo','رقم الشهادة (اختياري)','text',false],['issuedAt','تاريخ الإصدار','date',false]
      ],
      columns:[
        ['رقم الشهادة','certificateNo'],['الطالب','studentId.name'],['الدورة','courseId.title'],
        ['تاريخ الإصدار','issuedAt',v => fmtDate(v)],['الحالة','status',status]
      ]
    },
    notifications: {
      endpoint:'/api/academy/notifications',
      createRoles:['owner','admin','support'],
      title:'إشعار جديد',
      fields:[
        ['title','العنوان','text',true],['audience','المستلمون','select',true,'audience'],
        ['channel','القناة','select',true,'channel'],['status','الحالة','select',true,'notificationStatus'],
        ['message','نص الإشعار','textarea',true]
      ],
      columns:[
        ['العنوان','title'],['الفئة','audience'],['القناة','channel'],
        ['الحالة','status',status],['التاريخ','createdAt',v => fmtDate(v,true)]
      ]
    },
    support: {
      endpoint:'/api/academy/support',
      title:'فتح طلب دعم',
      createRoles:['owner','admin','branch_manager','instructor','accountant','reception','content_manager','support'],
      fields:[
        ['subject','الموضوع','text',true],['category','التصنيف','select',true,'supportCategory'],
        ['priority','الأولوية','select',true,'priority'],['message','شرح المشكلة','textarea',true]
      ],
      columns:[
        ['الموضوع','subject'],['التصنيف','category'],['الأولوية','priority'],
        ['الحالة','status',status],['تاريخ الفتح','createdAt',v => fmtDate(v,true)]
      ]
    }
  };

  function assessmentPage(type) {
    const isQuiz = type === 'quiz';
    return {
      endpoint:'/api/academy/assessments?type='+type,
      createEndpoint:'/api/academy/assessments',
      createRoles:['owner','admin','instructor','content_manager'],
      title:isQuiz ? 'إضافة اختبار' : 'إضافة واجب',
      extra:{ type },
      fields:[
        ['courseId','الدورة','dynamicSelect',true,'courses'],['title',isQuiz ? 'عنوان الاختبار' : 'عنوان الواجب','text',true],
        ['dueAt',isQuiz ? 'موعد الاختبار' : 'آخر موعد للتسليم','datetime-local',false],
        ['totalMarks','الدرجة الكاملة','number',false],
        ...(isQuiz ? [['passingMark','درجة النجاح','number',false],['durationMinutes','المدة بالدقائق','number',false]] : []),
        ['status','الحالة','select',true,'assessmentStatus'],['description','التعليمات','textarea',false]
      ],
      columns:[
        [isQuiz ? 'الاختبار':'الواجب','title'],['الدورة','courseId.title'],
        ['الدرجة','totalMarks'],['الموعد','dueAt',v => fmtDate(v,true)],['الحالة','status',status]
      ]
    };
  }

  async function fieldHtml(field) {
    const [name,label,type,required,source] = field;
    const req = required ? 'required' : '';
    const full = type === 'textarea' ? ' full' : '';

    if (type === 'textarea') {
      return '<div class="field'+full+'"><label>'+esc(label)+'</label><textarea name="'+esc(name)+'" '+req+'></textarea></div>';
    }

    if (type === 'select') {
      const options = staticOptions[source] || [];
      return '<div class="field"><label>'+esc(label)+'</label><select name="'+esc(name)+'" '+req+'><option value="">اختر...</option>'+
        options.map(x => '<option value="'+esc(x[0])+'">'+esc(x[1])+'</option>').join('')+
        '</select></div>';
    }

    if (type === 'dynamicSelect') {
      const opts = await getOptions();
      const rows = opts[source] || [];
      return '<div class="field"><label>'+esc(label)+'</label><select name="'+esc(name)+'" '+req+'><option value="">اختر...</option>'+
        rows.map(x => {
          const labelText = x.name || x.title || x.code || x.email || 'Item';
          const extra = x.code ? ' · '+x.code : x.email ? ' · '+x.email : '';
          return '<option value="'+esc(x._id)+'">'+esc(labelText+extra)+'</option>';
        }).join('')+
        '</select></div>';
    }

    return '<div class="field"><label>'+esc(label)+'</label><input name="'+esc(name)+'" type="'+esc(type)+'" '+req+'></div>';
  }

  async function openForm(config, onSaved) {
    const modal = document.getElementById('academyModal');
    document.getElementById('academyModalTitle').textContent = config.title || 'إضافة';
    document.getElementById('academyModalSubtitle').textContent = config.modalSubtitle || 'أدخل البيانات المطلوبة ثم احفظ.';
    const form = document.getElementById('academyModalForm');

    const fields = [];
    for (const field of config.fields || []) fields.push(await fieldHtml(field));

    form.innerHTML = fields.join('') + `
      <div class="academy-form-message" id="academyFormMessage"></div>
      <div class="academy-form-actions">
        <button class="btn ghost" type="button" id="academyFormCancel">إلغاء</button>
        <button class="btn primary" type="submit">حفظ</button>
      </div>
    `;

    modal.hidden = false;
    document.getElementById('academyFormCancel').onclick = () => modal.hidden = true;

    form.onsubmit = async e => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const msg = document.getElementById('academyFormMessage');
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'جاري الحفظ...';
      msg.textContent = '';

      const payload = Object.fromEntries(new FormData(form).entries());
      Object.assign(payload, config.extra || {});

      for (const key of Object.keys(payload)) {
        if (payload[key] === '') delete payload[key];
      }

      try {
        await api(config.createEndpoint || config.endpoint.split('?')[0], {
          method:'POST',
          body:JSON.stringify(payload)
        });
        modal.hidden = true;
        optionsCache.value = null;
        await onSaved();
      } catch (err) {
        msg.textContent = err.message;
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    };
  }

  function renderTable(rows, columns) {
    if (!rows.length) return '<div class="academy-empty">ما فيه بيانات مضافة حتى الآن.</div>';

    return '<div class="academy-table-wrap"><table class="academy-table"><thead><tr>'+
      columns.map(c => '<th>'+esc(c[0])+'</th>').join('')+
      '</tr></thead><tbody>'+
      rows.map(row => '<tr>'+
        columns.map(c => {
          const value = val(row,c[1]);
          const rendered = c[2] ? c[2](value,row) : esc(value || '—');
          return '<td>'+rendered+'</td>';
        }).join('')+
      '</tr>').join('')+
      '</tbody></table></div>';
  }

  function renderCourses(rows) {
    if (!rows.length) return '<div class="academy-empty">ابدأ بإضافة أول دورة للأكاديمية.</div>';
    return '<div class="academy-entity-grid">'+rows.map(row => `
      <article class="academy-entity-card">
        <div class="academy-entity-cover">
          ${row.thumbnailUrl ? '<img src="'+esc(row.thumbnailUrl)+'" alt="">' : esc((row.title || 'C').slice(0,2))}
        </div>
        <div class="academy-entity-body">
          <h3>${esc(row.title)}</h3>
          <p>${esc(row.description || 'بدون وصف حتى الآن.')}</p>
          <div class="academy-meta">
            <span>${esc(row.code || 'بدون كود')}</span>
            <span>${esc(row.category || 'عام')}</span>
            <span>${esc(row.deliveryType || 'recorded')}</span>
            <span>${fmtMoney(row.price || 0)}</span>
          </div>
          <div style="margin-top:12px">${status(row.status)}</div>
        </div>
      </article>
    `).join('')+'</div>';
  }

  function renderLessons(rows) {
    if (!rows.length) return '<div class="academy-empty">ما فيه دروس حتى الآن. أضف درس واربطه برابط YouTube.</div>';

    return '<div class="academy-video-grid">'+rows.map(row => `
      <article class="academy-video-card">
        <div class="academy-youtube">
          ${row.youtubeId
            ? '<iframe loading="lazy" src="https://www.youtube-nocookie.com/embed/'+encodeURIComponent(row.youtubeId)+'" title="'+esc(row.title)+'" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>'
            : '<div class="academy-video-placeholder">هذا الدرس بدون فيديو YouTube</div>'}
        </div>
        <div class="academy-video-info">
          <h3>${esc(row.title)}</h3>
          <p>${esc(row.courseId?.title || 'دورة')} · الدرس رقم ${esc(row.order || 1)} · ${esc(row.durationMinutes || 0)} دقيقة</p>
          <div class="academy-meta">
            <span>${row.youtubeId ? 'YouTube' : 'بدون فيديو'}</span>
            <span>${esc(row.status || 'draft')}</span>
          </div>
        </div>
      </article>
    `).join('')+'</div>';
  }

  async function renderGeneric(name) {
    const config = pages[name];
    const target = document.getElementById('pageContent');

    if (!config) {
      target.innerHTML = '<div class="academy-card academy-empty">الصفحة غير متاحة.</div>';
      return;
    }

    const canCreate = allowed(config.createRoles);
    target.innerHTML = `
      <section class="academy-card">
        <div class="academy-card-head">
          <div><h2>${esc(pageMeta[name][0])}</h2><p>${esc(pageMeta[name][1])}</p></div>
          <div class="academy-filter-row">
            <input class="academy-search" id="academySearch" placeholder="بحث داخل الصفحة...">
            ${canCreate ? '<button class="btn primary" id="academyAdd">+ إضافة</button>' : ''}
          </div>
        </div>
        <div id="academyRows"><div class="academy-empty">جاري تحميل البيانات...</div></div>
      </section>
    `;

    let rows = [];

    const draw = () => {
      const q = (document.getElementById('academySearch').value || '').trim().toLowerCase();
      const filtered = q ? rows.filter(x => JSON.stringify(x).toLowerCase().includes(q)) : rows;
      const box = document.getElementById('academyRows');
      if (config.view === 'cards') box.innerHTML = renderCourses(filtered);
      else if (config.view === 'videos') box.innerHTML = renderLessons(filtered);
      else box.innerHTML = renderTable(filtered, config.columns || []);
    };

    const load = async () => {
      try {
        rows = await api(config.endpoint);
        draw();
      } catch (err) {
        document.getElementById('academyRows').innerHTML = '<div class="academy-empty">'+esc(err.message)+'</div>';
      }
    };

    document.getElementById('academySearch').addEventListener('input', draw);
    if (canCreate) document.getElementById('academyAdd').onclick = () => openForm(config, load);
    await load();
  }

  async function renderDashboard() {
    const target = document.getElementById('pageContent');
    target.innerHTML = '<div class="academy-empty">جاري تجهيز لوحة التحكم...</div>';

    try {
      const d = await api('/api/academy/dashboard');
      const quick = [
        ['students','S','الطلاب','إضافة ومتابعة الطلاب'],
        ['courses','C','الدورات','إدارة المحتوى والدورات'],
        ['lessons','▶','الدروس','روابط YouTube والدروس'],
        ['live','Z','المباشر','جلسات Zoom القادمة']
      ].filter(x => {
        const navItem = navGroups.flatMap(g => g.items).find(i => i[0] === x[0]);
        return !navItem || allowed(navItem[3]);
      });

      target.innerHTML = `
        <section class="academy-kpis">
          ${kpi('الطلاب',d.students,'S')}
          ${kpi('الدورات',d.courses,'C')}
          ${kpi('التسجيلات النشطة',d.activeEnrollments,'E')}
          ${kpi('المحاضرات القادمة',d.upcomingLive,'Z')}
        </section>

        <section class="academy-grid-2">
          <article class="academy-card">
            <div class="academy-card-head"><div><h2>اختصارات سريعة</h2><p>أكثر الأدوات استخدامًا في الأكاديمية.</p></div></div>
            <div class="academy-quick-grid">
              ${quick.map(x => '<a class="academy-quick" href="'+href(x[0])+'"><i>'+esc(x[1])+'</i><span><b>'+esc(x[2])+'</b><span>'+esc(x[3])+'</span></span></a>').join('')}
            </div>
          </article>

          <article class="academy-card">
            <div class="academy-card-head"><div><h2>ملخص مالي</h2><p>إجمالي الدفعات المدفوعة المسجلة.</p></div></div>
            <div style="font-family:var(--font-display);font-size:34px;font-weight:800;color:var(--primary)">${fmtMoney(d.revenue)}</div>
            <div class="academy-note" style="margin-top:14px">الأرقام تعتمد على الدفعات المسجلة بحالة “مدفوع”. التقارير التفصيلية موجودة في صفحة التقارير.</div>
          </article>
        </section>

        <section class="academy-card academy-section">
          <div class="academy-card-head"><div><h2>المحاضرات القادمة</h2><p>أقرب جلسات Zoom المجدولة.</p></div><a class="btn soft" href="/academy/live.html">عرض الكل</a></div>
          <div class="academy-list">
            ${d.upcomingSessions?.length ? d.upcomingSessions.map(x => `
              <div class="academy-list-row">
                <div><b>${esc(x.title)}</b><span>${fmtDate(x.startAt,true)} · ${esc(x.course || 'بدون دورة')} · ${esc(x.instructor || 'بدون مدرب')}</span></div>
                ${x.zoomJoinUrl ? '<a class="btn soft" target="_blank" rel="noopener" href="'+esc(x.zoomJoinUrl)+'">Zoom</a>' : status('scheduled')}
              </div>
            `).join('') : '<div class="academy-empty">لا توجد محاضرات قادمة.</div>'}
          </div>
        </section>
      `;
    } catch (err) {
      target.innerHTML = '<div class="academy-card academy-empty">'+esc(err.message)+'</div>';
    }
  }

  function kpi(label,value,icon) {
    return `
      <article class="academy-kpi">
        <div class="academy-kpi-head"><small>${esc(label)}</small><span class="academy-kpi-icon">${esc(icon)}</span></div>
        <strong>${esc(value ?? 0)}</strong>
      </article>
    `;
  }

  async function renderLive() {
    const target = document.getElementById('pageContent');
    const config = {
      title:'جدولة محاضرة Zoom',
      createRoles:['owner','admin','instructor'],
      fields:[
        ['title','عنوان المحاضرة','text',true],
        ['courseId','الدورة','dynamicSelect',false,'courses'],
        ['instructorId','المدرب','dynamicSelect',true,'instructors'],
        ['startAt','موعد البداية','datetime-local',true],
        ['durationMinutes','المدة بالدقائق','number',false],
        ['description','الوصف','textarea',false]
      ],
      endpoint:'/api/live-sessions'
    };

    target.innerHTML = `
      <section class="academy-card">
        <div class="academy-card-head">
          <div><h2>جلسات Zoom</h2><p>أنشئ الموعد من AcademyFlow، وإذا تم ضبط Zoom على السيرفر ينشأ الاجتماع تلقائيًا.</p></div>
          ${allowed(config.createRoles) ? '<button class="btn primary" id="academyAddLive">+ محاضرة</button>' : ''}
        </div>
        <div class="academy-note" style="margin-bottom:14px">رابط بدء الاجتماع الخاص بالمدرب لا يتم عرضه للطلاب. رابط الانضمام فقط هو الذي يظهر في الواجهة العامة للمحاضرة.</div>
        <div id="liveRows"><div class="academy-empty">جاري التحميل...</div></div>
      </section>
    `;

    const load = async () => {
      try {
        const rows = await api('/api/live-sessions');
        document.getElementById('liveRows').innerHTML = rows.length ? '<div class="academy-list">'+rows.map(x => `
          <div class="academy-list-row">
            <div><b>${esc(x.title)}</b><span>${fmtDate(x.startAt,true)} · ${esc(x.durationMinutes || 60)} دقيقة</span></div>
            <div style="display:flex;gap:8px;align-items:center">
              ${status(x.status)}
              ${x.zoomJoinUrl ? '<a class="btn soft" target="_blank" rel="noopener" href="'+esc(x.zoomJoinUrl)+'">فتح Zoom</a>' : ''}
            </div>
          </div>
        `).join('')+'</div>' : '<div class="academy-empty">لا توجد محاضرات مجدولة.</div>';
      } catch (err) {
        document.getElementById('liveRows').innerHTML = '<div class="academy-empty">'+esc(err.message)+'</div>';
      }
    };

    if (allowed(config.createRoles)) document.getElementById('academyAddLive').onclick = () => openForm(config, load);
    await load();
  }

  async function renderReports() {
    const target = document.getElementById('pageContent');
    target.innerHTML = '<div class="academy-empty">جاري إعداد التقرير...</div>';

    try {
      const r = await api('/api/academy/reports');
      target.innerHTML = `
        <section class="academy-report-grid">
          ${reportCard('الطلاب',r.students)}
          ${reportCard('الدورات',r.courses)}
          ${reportCard('التسجيلات',r.enrollments)}
          ${reportCard('الإيرادات',fmtMoney(r.revenue))}
        </section>
        <section class="academy-grid-2 academy-section">
          <article class="academy-card">
            <div class="academy-card-head"><div><h2>نسبة الحضور</h2><p>الحضور + التأخير محسوبان كحضور فعلي.</p></div></div>
            <div style="font-size:34px;font-family:var(--font-display);font-weight:800;margin-bottom:12px">${esc(r.attendanceRate)}%</div>
            <div class="academy-progress"><i style="width:${Math.max(0,Math.min(100,Number(r.attendanceRate || 0)))}%"></i></div>
          </article>
          <article class="academy-card">
            <div class="academy-card-head"><div><h2>العمليات المدفوعة</h2><p>عدد الدفعات التي تم تسجيلها كمدفوعة.</p></div></div>
            <div style="font-size:34px;font-family:var(--font-display);font-weight:800;color:var(--primary)">${esc(r.paidTransactions)}</div>
          </article>
        </section>
        <section class="academy-card academy-section">
          <div class="academy-card-head"><div><h2>أكثر الدورات تسجيلًا</h2><p>مرتبة حسب عدد التسجيلات الحالية.</p></div></div>
          <div class="academy-list">
            ${r.topCourses?.length ? r.topCourses.map((x,i) => '<div class="academy-list-row"><div><b>'+(i+1)+'. '+esc(x.title)+'</b><span>عدد التسجيلات</span></div><strong>'+esc(x.enrollments)+'</strong></div>').join('') : '<div class="academy-empty">لا توجد بيانات كافية حتى الآن.</div>'}
          </div>
        </section>
      `;
    } catch (err) {
      target.innerHTML = '<div class="academy-card academy-empty">'+esc(err.message)+'</div>';
    }
  }

  function reportCard(label,value) {
    return '<article class="academy-report-card"><small>'+esc(label)+'</small><strong>'+esc(value ?? 0)+'</strong></article>';
  }

  async function renderCalendar() {
    const target = document.getElementById('pageContent');
    target.innerHTML = '<div class="academy-empty">جاري تحميل المواعيد...</div>';
    try {
      const rows = await api('/api/live-sessions');
      const sorted = rows.slice().sort((a,b) => new Date(a.startAt) - new Date(b.startAt));
      target.innerHTML = `
        <section class="academy-card">
          <div class="academy-card-head"><div><h2>جدول المحاضرات</h2><p>المواعيد مرتبة من الأقرب إلى الأبعد.</p></div><a class="btn primary" href="/academy/live.html">إدارة المحاضرات</a></div>
          <div class="academy-list">
            ${sorted.length ? sorted.map(x => `
              <div class="academy-list-row">
                <div><b>${esc(x.title)}</b><span>${fmtDate(x.startAt,true)} · ${esc(x.durationMinutes || 60)} دقيقة</span></div>
                ${status(x.status)}
              </div>
            `).join('') : '<div class="academy-empty">ما فيه مواعيد في التقويم حاليًا.</div>'}
          </div>
        </section>
      `;
    } catch (err) {
      target.innerHTML = '<div class="academy-card academy-empty">'+esc(err.message)+'</div>';
    }
  }

  async function renderSettings() {
    const target = document.getElementById('pageContent');
    target.innerHTML = '<div class="academy-empty">جاري تحميل الإعدادات...</div>';

    try {
      const s = await api('/api/academy/settings');
      target.innerHTML = `
        <form id="settingsForm" class="academy-settings-grid">
          <section class="academy-settings-section">
            <h3>بيانات الأكاديمية</h3>
            ${settingsInput('name','اسم الأكاديمية',s.name)}
            ${settingsInput('nameEn','الاسم بالإنجليزية',s.nameEn)}
            ${settingsInput('phone','رقم الهاتف',s.phone)}
            ${settingsInput('email','البريد الإلكتروني',s.email,'email')}
            ${settingsInput('city','المدينة',s.city)}
            ${settingsInput('country','الدولة',s.country)}
          </section>
          <section class="academy-settings-section">
            <h3>الهوية والتفضيلات</h3>
            ${settingsInput('logoUrl','رابط الشعار',s.logoUrl,'url')}
            ${settingsInput('currency','العملة',s.currency)}
            ${settingsInput('timezone','المنطقة الزمنية',s.timezone)}
            ${settingsInput('branding.primaryColor','اللون الأساسي',s.branding?.primaryColor || '#0f766e','color')}
            ${settingsInput('branding.secondaryColor','اللون الثانوي',s.branding?.secondaryColor || '#0f172a','color')}
            ${settingsInput('branding.coverUrl','رابط صورة الغلاف',s.branding?.coverUrl,'url')}
          </section>
          <div class="academy-form-message" id="settingsMsg"></div>
          <div class="academy-form-actions">
            <button class="btn primary" type="submit">حفظ الإعدادات</button>
          </div>
        </form>
        <section class="academy-card academy-section">
          <div class="academy-note">كود الأكاديمية: <b>${esc(s.code)}</b> · الحالة: <b>${esc(s.status)}</b>. هذه القيم يديرها مالك منصة AcademyFlow وليست قابلة للتغيير من إعدادات الأكاديمية.</div>
        </section>
      `;

      document.getElementById('settingsForm').onsubmit = async e => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const payload = {
          branding: {}
        };
        for (const [k,v] of fd.entries()) {
          if (k.startsWith('branding.')) payload.branding[k.split('.')[1]] = v;
          else payload[k] = v;
        }

        const msg = document.getElementById('settingsMsg');
        try {
          await api('/api/academy/settings',{method:'PATCH',body:JSON.stringify(payload)});
          msg.style.color = 'var(--success)';
          msg.textContent = 'تم حفظ الإعدادات بنجاح.';
        } catch (err) {
          msg.style.color = 'var(--danger)';
          msg.textContent = err.message;
        }
      };
    } catch (err) {
      target.innerHTML = '<div class="academy-card academy-empty">'+esc(err.message)+'</div>';
    }
  }

  function settingsInput(name,label,value,type='text') {
    return '<div class="field"><label>'+esc(label)+'</label><input name="'+esc(name)+'" type="'+esc(type)+'" value="'+esc(value || '')+'"></div>';
  }

  async function init() {
    renderShell();

    const restricted = navGroups.flatMap(x => x.items).find(x => x[0] === page);
    if (restricted && !allowed(restricted[3])) {
      document.getElementById('pageContent').innerHTML = '<div class="academy-card academy-empty">ما عندك صلاحية للوصول إلى هذه الصفحة.</div>';
      return;
    }

    if (page === 'dashboard') return renderDashboard();
    if (page === 'live') return renderLive();
    if (page === 'reports') return renderReports();
    if (page === 'settings') return renderSettings();
    if (page === 'calendar') return renderCalendar();
    return renderGeneric(page);
  }

  document.addEventListener('DOMContentLoaded', init);
  return { api };
})();