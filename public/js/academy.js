const AF = (() => {
  let user = null;
  try { user = JSON.parse(localStorage.getItem('af_user') || 'null'); } catch {}

  if (!user || user.role === 'superadmin') {
    location.href = '/academy/login.html';
    return {};
  }

  if (user.role === 'student') {
    location.href = '/student/dashboard.html';
    return {};
  }

  if (user.role === 'instructor') {
    location.href = '/instructor/dashboard.html';
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
        ['calendar','التقويم','CAL', ['owner','admin']]
      ]
    },
    {
      label: 'التعليم',
      items: [
        ['courses','الدورات','C', ['owner','admin','branch_manager','reception','content_manager']],
        ['lessons','الدروس والفيديو','▶', ['owner','admin','content_manager']],
        ['groups','المجموعات','G', ['owner','admin','branch_manager','reception']],
        ['live','المحاضرات المباشرة','Z', ['owner','admin']],
        ['quizzes','الاختبارات','Q', ['owner','admin','content_manager']],
        ['assignments','الواجبات','A', ['owner','admin','content_manager']]
      ]
    },
    {
      label: 'الأشخاص',
      items: [
        ['students','الطلاب','S', ['owner','admin','branch_manager','reception']],
        ['instructors','المدربين','I', ['owner','admin','branch_manager','reception','content_manager']],
        ['staff','الموظفين','T', ['owner','admin']],
        ['enrollments','التسجيلات','E', ['owner','admin','branch_manager','reception']],
        ['attendance','الحضور','✓', ['owner','admin','branch_manager','reception']]
      ]
    },
    {
      label: 'الإدارة',
      items: [
        ['branches','الفروع','B', ['owner','admin','branch_manager','reception']],
        ['payments','المدفوعات','P', ['owner','admin','accountant']],
        ['certificates','الشهادات','C', ['owner','admin','content_manager']],
        ['reports','التقارير','R', ['owner','admin','accountant']]
      ]
    },
    {
      label: 'التواصل والنظام',
      items: [
        ['notifications','الإشعارات','N', ['owner','admin','support']],
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
    quizzes: ['الاختبارات','إنشاء وإدارة الاختبارات والأسئلة والمحاولات والنتائج.'],
    'quiz-builder': ['منشئ الاختبار','إعداد الأسئلة ونشر الاختبار ومتابعة نتائج الطلاب.'],
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
      ...(options.body ? {'Content-Type':'application/json'} : {}),
      ...(options.headers || {})
    };

    const response = await fetch(url, { ...options, credentials: 'same-origin', headers });

    if (response.status === 401 || response.status === 403) {
      if (response.status === 401) {
        localStorage.removeItem('af_token');
        localStorage.removeItem('af_user');
        location.href = '/academy/login.html';
        throw new Error('Unauthorized');
      }
    }

    if (response.status === 428 && user?.role === 'owner') {
      location.href = '/academy/legal-acceptance.html';
      throw new Error('Legal acceptance required');
    }

    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    if (!response.ok) {
      const error = new Error(data?.message || 'تعذر تنفيذ العملية');
      error.status = response.status;
      error.data = data;
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
          const active = (item[0] === page || (page === 'quiz-builder' && item[0] === 'quizzes')) ? 'active' : '';
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
                <button class="theme-toggle" data-theme-toggle data-theme-icon type="button" title="تبديل الوضع">◐</button>
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

    document.getElementById('academyLogout').onclick = async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      } catch {}
      localStorage.removeItem('af_token');
      localStorage.removeItem('af_user');
      location.replace('/academy/login.html');
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
      ...(user.role === 'owner' ? [['admin','مدير']] : []),
      ['branch_manager','مدير فرع'],['accountant','محاسب'],
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
      updateEndpoint:'/api/academy/users/:id',
      createRoles:['owner','admin'],
      manageRoles:['owner','admin'],
      actions:{ details:true, edit:true },
      title:'إضافة موظف',
      editTitle:'تعديل الموظف والصلاحية',
      fields:[
        ['name','اسم الموظف','text',true],['email','البريد الإلكتروني','email',true],
        ['phone','رقم الهاتف','text',false],['role','الدور','select',true,'userRole'],
        ['branchId','الفرع (إجباري لمدير الفرع)','dynamicSelect',false,'branches'],
        ['password','كلمة مرور مؤقتة','password',true]
      ],
      editFields:[
        ['name','اسم الموظف','text',true],['email','البريد الإلكتروني','email',true],
        ['phone','رقم الهاتف','text',false],['role','الدور','select',true,'userRole'],
        ['branchId','الفرع (إجباري لمدير الفرع)','dynamicSelect',false,'branches']
      ],
      columns:[
        ['الموظف','name'],['البريد','email'],
        ['الدور','role',v => esc(roleLabels[v] || v)],['الفرع','branchId.name'],
        ['الهاتف','phone'],['الحالة','active',v => v ? status('active') : status('suspended')]
      ]
    },
    branches: {
      endpoint:'/api/academy/branches',
      createRoles:['owner','admin'],
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
      updateEndpoint:'/api/academy/courses/:id',
      createRoles:['owner','admin','content_manager'],
      manageRoles:['owner','admin','content_manager'],
      actions:{
        details:true,
        edit:true,
        extendField:'endAt',
        extendLabel:'تمديد الدورة',
        cancelStatus:'archived',
        cancelLabel:'أرشفة الدورة',
        reopenStatus:'active',
        reopenLabel:'إعادة التفعيل'
      },
      title:'إضافة دورة',
      view:'cards',
      fields:[
        ['title','اسم الدورة','text',true],['code','كود الدورة','text',false],
        ['category','التصنيف','text',false],['deliveryType','نوع الدورة','select',true,'deliveryType'],
        ['instructorId','المدرب','dynamicSelect',false,'instructors'],
        ...(allowed(['owner','admin']) ? [['price','السعر','number',false]] : []),
        ['startAt','تاريخ البداية','date',false],
        ['endAt','تاريخ النهاية','date',false],['status','الحالة','select',true,'courseStatus'],
        ['thumbnailUrl','رابط صورة الغلاف','url',false],['description','الوصف','textarea',false]
      ]
    },
    lessons: {
      endpoint:'/api/academy/lessons',
      createRoles:['owner','admin','content_manager'],
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
      updateEndpoint:'/api/academy/groups/:id',
      createRoles:['owner','admin','branch_manager'],
      manageRoles:['owner','admin','branch_manager'],
      actions:{
        details:true,
        edit:true,
        extendField:'endAt',
        extendLabel:'تمديد المجموعة',
        cancelStatus:'cancelled',
        cancelLabel:'إلغاء المجموعة',
        reopenStatus:'active',
        reopenLabel:'إعادة التفعيل'
      },
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
      createRoles:['owner','admin','reception','branch_manager'],
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
      updateEndpoint:'/api/academy/assessments/:id',
      createRoles:['owner','admin','content_manager'],
      manageRoles:['owner','admin','content_manager'],
      title:isQuiz ? 'إضافة اختبار' : 'إضافة واجب',
      extra:{ type },
      actions:isQuiz ? null : {
        details:true,
        edit:true,
        extendField:'dueAt',
        extendLabel:'تمديد التسليم',
        cancelStatus:'closed',
        cancelLabel:'إغلاق الواجب',
        reopenStatus:'published',
        reopenLabel:'إعادة فتح الواجب'
      },
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

  function inputValue(value, type) {
    if (value === null || value === undefined) return '';

    if (
      type === 'datetime-local' &&
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) &&
      !/[zZ]|[+-]\d{2}:\d{2}$/.test(value)
    ) {
      return value.slice(0,16);
    }

    if (type === 'date' || type === 'datetime-local') {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return '';

      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
      return type === 'date'
        ? local.toISOString().slice(0,10)
        : local.toISOString().slice(0,16);
    }

    if (typeof value === 'object') {
      return value._id || value.id || '';
    }

    return value;
  }

  async function fieldHtml(field, currentValue = '') {
    const [name,label,type,required,source] = field;
    const req = required ? 'required' : '';
    const full = type === 'textarea' ? ' full' : '';
    const current = inputValue(currentValue, type);

    if (type === 'textarea') {
      return '<div class="field'+full+'"><label>'+esc(label)+'</label><textarea name="'+esc(name)+'" '+req+'>'+esc(current)+'</textarea></div>';
    }

    if (type === 'select') {
      const options = staticOptions[source] || [];
      return '<div class="field"><label>'+esc(label)+'</label><select name="'+esc(name)+'" '+req+'><option value="">اختر...</option>'+
        options.map(x => '<option value="'+esc(x[0])+'" '+(String(x[0])===String(current)?'selected':'')+'>'+esc(x[1])+'</option>').join('')+
        '</select></div>';
    }

    if (type === 'dynamicSelect') {
      const opts = await getOptions();
      const rows = opts[source] || [];
      const courseMap = new Map((opts.courses || []).map(course => [String(course._id), course.title]));
      return '<div class="field"><label>'+esc(label)+'</label><select name="'+esc(name)+'" '+req+'><option value="">اختر...</option>'+
        rows.map(x => {
          const labelText = x.name || x.title || x.code || x.email || 'Item';
          const courseExtra = source === 'groups' && x.courseId ? ' · '+(courseMap.get(String(x.courseId)) || 'دورة') : '';
          const extra = courseExtra || (x.code ? ' · '+x.code : x.email ? ' · '+x.email : '');
          return '<option value="'+esc(x._id)+'" '+(String(x._id)===String(current)?'selected':'')+'>'+esc(labelText+extra)+'</option>';
        }).join('')+
        '</select></div>';
    }

    return '<div class="field"><label>'+esc(label)+'</label><input name="'+esc(name)+'" type="'+esc(type)+'" value="'+esc(current)+'" '+req+'></div>';
  }

  async function openForm(config, onSaved, row = null) {
    const modal = document.getElementById('academyModal');
    const editing = Boolean(row);
    document.getElementById('academyModalTitle').textContent =
      editing ? (config.editTitle || 'تعديل البيانات') : (config.title || 'إضافة');
    document.getElementById('academyModalSubtitle').textContent =
      editing ? 'عدّل البيانات المطلوبة ثم احفظ التغييرات.' : (config.modalSubtitle || 'أدخل البيانات المطلوبة ثم احفظ.');

    const form = document.getElementById('academyModalForm');
    const fields = [];
    const formFields = editing && config.editFields
      ? config.editFields
      : (config.fields || []);

    for (const field of formFields) {
      fields.push(await fieldHtml(field, editing ? val(row, field[0]) : ''));
    }

    form.innerHTML = fields.join('') + `
      <div class="academy-form-message" id="academyFormMessage"></div>
      <div class="academy-form-actions">
        <button class="btn ghost" type="button" id="academyFormCancel">إلغاء</button>
        <button class="btn primary" type="submit">${editing ? 'حفظ التعديلات' : 'حفظ'}</button>
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
        let endpoint;
        let method;

        if (editing) {
          if (!config.updateEndpoint) throw new Error('التعديل غير متاح لهذا السجل');
          endpoint = config.updateEndpoint.replace(':id', encodeURIComponent(row._id || row.id));
          method = 'PATCH';
        } else {
          endpoint = config.createEndpoint || config.endpoint.split('?')[0];
          method = 'POST';
        }

        const saved = await api(endpoint, {
          method,
          body:JSON.stringify(payload)
        });

        if (saved?.zoomWarning) {
          alert(saved.zoomWarning);
        }

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

  function detailsValue(field, row) {
    const [name,,type] = field;
    const value = val(row,name);

    if (value === null || value === undefined || value === '') return '—';
    if (name === 'startAt' && row.startAtDisplay) return row.startAtDisplay;
    if (type === 'date') return fmtDate(value);
    if (type === 'datetime-local') return fmtDate(value,true);

    if (typeof value === 'object') {
      return value.name || value.title || value.code || value.email || value._id || '—';
    }

    if (name === 'status') return value;
    return String(value);
  }

  function openDetails(config, row) {
    const modal = document.getElementById('academyModal');
    const form = document.getElementById('academyModalForm');

    document.getElementById('academyModalTitle').textContent =
      row.title || row.name || 'التفاصيل';
    document.getElementById('academyModalSubtitle').textContent =
      'كل المعلومات المسجلة لهذا العنصر.';

    const items = (config.fields || []).map(field => {
      const raw = val(row, field[0]);
      const rendered = field[0] === 'status'
        ? status(raw)
        : esc(detailsValue(field,row));

      return '<div class="academy-detail-item"><small>'+esc(field[1])+'</small><div>'+rendered+'</div></div>';
    }).join('');

    form.innerHTML =
      '<div class="academy-details-grid full">'+items+'</div>'+
      '<div class="academy-form-actions full"><button class="btn primary" id="academyDetailsClose" type="button">تم</button></div>';

    modal.hidden = false;
    document.getElementById('academyDetailsClose').onclick = () => modal.hidden = true;
    form.onsubmit = e => e.preventDefault();
  }

  async function openExtend(config, row, onSaved) {
    const fieldName = config.actions?.extendField;
    const field = (config.fields || []).find(x => x[0] === fieldName);

    if (!field || !config.updateEndpoint) return;

    const modal = document.getElementById('academyModal');
    const form = document.getElementById('academyModalForm');

    document.getElementById('academyModalTitle').textContent =
      config.actions.extendLabel || 'تمديد';
    document.getElementById('academyModalSubtitle').textContent =
      'حدد الموعد الجديد ثم احفظ.';

    form.innerHTML =
      await fieldHtml(field, val(row,fieldName)) +
      '<div class="academy-form-message" id="academyFormMessage"></div>'+
      '<div class="academy-form-actions"><button class="btn ghost" id="academyExtendCancel" type="button">إلغاء</button><button class="btn primary" type="submit">حفظ التمديد</button></div>';

    modal.hidden = false;
    document.getElementById('academyExtendCancel').onclick = () => modal.hidden = true;

    form.onsubmit = async e => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const msg = document.getElementById('academyFormMessage');
      const value = new FormData(form).get(fieldName);

      btn.disabled = true;
      msg.textContent = '';

      try {
        await api(
          config.updateEndpoint.replace(':id',encodeURIComponent(row._id || row.id)),
          {
            method:'PATCH',
            body:JSON.stringify({ [fieldName]: value || null })
          }
        );

        modal.hidden = true;
        await onSaved();
      } catch (err) {
        msg.textContent = err.message;
      } finally {
        btn.disabled = false;
      }
    };
  }

  async function changeRecordStatus(config, row, nextStatus, label, onSaved) {
    if (!config.updateEndpoint) return;

    if (!confirm((label || 'تنفيذ الإجراء')+'؟')) return;

    try {
      await api(
        config.updateEndpoint.replace(':id',encodeURIComponent(row._id || row.id)),
        {
          method:'PATCH',
          body:JSON.stringify({ status:nextStatus })
        }
      );
      await onSaved();
    } catch (err) {
      alert(err.message);
    }
  }

  function actionButtons(config, row, index) {
    if (!config.actions) return '';

    const canManage = allowed(config.manageRoles);
    const cancelled = row.status === config.actions.cancelStatus;

    return '<div class="academy-row-actions">'+
      (config.actions.details ? '<button class="btn soft entity-action" data-action="details" data-index="'+index+'" type="button">تفاصيل</button>' : '')+
      (canManage && config.actions.edit ? '<button class="btn soft entity-action" data-action="edit" data-index="'+index+'" type="button">تعديل</button>' : '')+
      (canManage && config.actions.extendField ? '<button class="btn soft entity-action" data-action="extend" data-index="'+index+'" type="button">تمديد</button>' : '')+
      (canManage && config.actions.cancelStatus
        ? '<button class="btn '+(cancelled?'primary':'ghost')+' entity-action" data-action="'+(cancelled?'reopen':'cancel')+'" data-index="'+index+'" type="button">'+
            esc(cancelled ? (config.actions.reopenLabel || 'إعادة فتح') : (config.actions.cancelLabel || 'إلغاء'))+
          '</button>'
        : '')+
      '</div>';
  }

  function bindEntityActions(config, visibleRows, onSaved) {
    document.querySelectorAll('.entity-action').forEach(btn => {
      btn.onclick = () => {
        const row = visibleRows[Number(btn.dataset.index)];
        if (!row) return;

        if (btn.dataset.action === 'details') return openDetails(config,row);
        if (btn.dataset.action === 'edit') return openForm(config,onSaved,row);
        if (btn.dataset.action === 'extend') return openExtend(config,row,onSaved);

        if (btn.dataset.action === 'cancel') {
          return changeRecordStatus(
            config,row,
            config.actions.cancelStatus,
            config.actions.cancelLabel,
            onSaved
          );
        }

        if (btn.dataset.action === 'reopen') {
          return changeRecordStatus(
            config,row,
            config.actions.reopenStatus,
            config.actions.reopenLabel,
            onSaved
          );
        }
      };
    });
  }

  function renderTable(rows, columns, config = null) {
    if (!rows.length) return '<div class="academy-empty">ما فيه بيانات مضافة حتى الآن.</div>';

    const hasActions = Boolean(config?.actions);

    return '<div class="academy-table-wrap"><table class="academy-table"><thead><tr>'+
      columns.map(c => '<th>'+esc(c[0])+'</th>').join('')+
      (hasActions ? '<th>الإجراءات</th>' : '')+
      '</tr></thead><tbody>'+
      rows.map((row,index) => '<tr>'+
        columns.map(c => {
          const value = val(row,c[1]);
          const rendered = c[2] ? c[2](value,row) : esc(value || '—');
          return '<td>'+rendered+'</td>';
        }).join('')+
        (hasActions ? '<td>'+actionButtons(config,row,index)+'</td>' : '')+
      '</tr>').join('')+
      '</tbody></table></div>';
  }

  function renderCourses(rows, config = null) {
    if (!rows.length) return '<div class="academy-empty">ابدأ بإضافة أول دورة للأكاديمية.</div>';

    return '<div class="academy-entity-grid">'+rows.map((row,index) => `
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
          ${config?.actions ? '<div style="margin-top:12px">'+actionButtons(config,row,index)+'</div>' : ''}
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
    let visibleRows = [];

    const draw = () => {
      const q = (document.getElementById('academySearch').value || '').trim().toLowerCase();
      visibleRows = q ? rows.filter(x => JSON.stringify(x).toLowerCase().includes(q)) : rows;

      const box = document.getElementById('academyRows');

      if (config.view === 'cards') box.innerHTML = renderCourses(visibleRows,config);
      else if (config.view === 'videos') box.innerHTML = renderLessons(visibleRows);
      else box.innerHTML = renderTable(visibleRows,config.columns || [],config);

      bindEntityActions(config,visibleRows,load);
    };

    const load = async () => {
      try {
        rows = await api(config.endpoint);
        draw();
      } catch (err) {
        document.getElementById('academyRows').innerHTML =
          '<div class="academy-empty">'+esc(err.message)+'</div>';
      }
    };

    document.getElementById('academySearch').addEventListener('input',draw);

    if (canCreate) {
      document.getElementById('academyAdd').onclick = () => openForm(config,load);
    }

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
        ['lessons','▶','الدروس','إدارة الدروس والفيديو'],
        ['live','Z','المحاضرات','جلسات Zoom القادمة']
      ].filter(x => {
        const navItem = navGroups.flatMap(g => g.items).find(i => i[0] === x[0]);
        return !navItem || allowed(navItem[3]);
      });

      const todayLabel = new Intl.DateTimeFormat('ar-OM', {
        weekday:'long',
        day:'numeric',
        month:'long'
      }).format(new Date());

      target.innerHTML = `
        <section class="academy-dashboard-intro">
          <div>
            <span class="academy-dashboard-kicker">ملخص التشغيل · ${esc(todayLabel)}</span>
            <h2>كل التفاصيل. <span>في تناغم واحد.</span></h2>
            <p>تابع الطلاب والدورات والتسجيلات والمحاضرات القادمة من مكان واحد.</p>
          </div>
          <div class="academy-dashboard-intro-actions">
            ${allowed(['owner','admin','accountant']) ? '<a class="btn ghost" href="/academy/reports.html">التقارير</a>' : ''}
            ${allowed(['owner','admin','branch_manager','reception']) ? '<a class="btn primary" href="/academy/students.html">إدارة الطلاب</a>' : ''}
          </div>
        </section>

        <section class="academy-kpis academy-dashboard-kpis">
          ${kpi('إجمالي الطلاب',d.students,'S','طالب مسجل في الأكاديمية')}
          ${kpi('الدورات',d.courses,'C','الدورات الموجودة في النظام')}
          ${kpi('التسجيلات النشطة',d.activeEnrollments,'E','طلاب مسجلون حاليًا')}
          ${kpi('المحاضرات القادمة',d.upcomingLive,'Z','جلسات مجدولة قادمة')}
        </section>

        <section class="academy-dashboard-grid">
          <article class="academy-card academy-dashboard-sessions">
            <div class="academy-card-head">
              <div>
                <span class="academy-section-label">الجدول القادم</span>
                <h2>المحاضرات القادمة</h2>
                <p>أقرب جلسات Zoom المجدولة للأكاديمية.</p>
              </div>
              <a class="btn soft" href="/academy/live.html">عرض الكل</a>
            </div>

            <div class="academy-session-list">
              ${d.upcomingSessions?.length ? d.upcomingSessions.map(x => `
                <div class="academy-session-row">
                  <div class="academy-session-time">
                    <strong>${esc(new Date(x.startAt).toLocaleTimeString('ar-OM',{hour:'2-digit',minute:'2-digit'}))}</strong>
                    <span>${fmtDate(x.startAt)}</span>
                  </div>
                  <div class="academy-session-main">
                    <b>${esc(x.title)}</b>
                    <span>${esc(x.course || 'بدون دورة')} · ${esc(x.instructor || 'بدون مدرب')}</span>
                  </div>
                  <div class="academy-session-action">
                    ${x.zoomJoinUrl ? '<a class="btn soft" target="_blank" rel="noopener" href="'+esc(x.zoomJoinUrl)+'">فتح Zoom</a>' : status('scheduled')}
                  </div>
                </div>
              `).join('') : '<div class="academy-empty academy-empty-clean">لا توجد محاضرات قادمة حاليًا.</div>'}
            </div>
          </article>

          <aside class="academy-dashboard-side">
            <article class="academy-card academy-finance-card">
              <div class="academy-card-head">
                <div>
                  <span class="academy-section-label">المالية</span>
                  <h2>الدفعات المدفوعة</h2>
                  <p>إجمالي المبالغ المسجلة بحالة مدفوع.</p>
                </div>
              </div>
              <div class="academy-finance-value">${fmtMoney(d.revenue)}</div>
              <div class="academy-finance-foot">
                <span>القيمة من السجلات الحالية</span>
                ${allowed(['owner','admin','accountant']) ? '<a href="/academy/reports.html">التفاصيل ←</a>' : ''}
              </div>
            </article>

            <article class="academy-card academy-quick-card">
              <div class="academy-card-head">
                <div>
                  <span class="academy-section-label">وصول سريع</span>
                  <h2>اختصارات</h2>
                  <p>انتقل مباشرة لأكثر المهام استخدامًا.</p>
                </div>
              </div>
              <div class="academy-quick-grid academy-dashboard-quick-grid">
                ${quick.map(x => '<a class="academy-quick" href="'+href(x[0])+'"><i>'+esc(x[1])+'</i><span><b>'+esc(x[2])+'</b><span>'+esc(x[3])+'</span></span><em>←</em></a>').join('')}
              </div>
            </article>
          </aside>
        </section>
      `;
    } catch (err) {
      target.innerHTML = '<div class="academy-card academy-empty">'+esc(err.message)+'</div>';
    }
  }

  function kpi(label,value,icon,description = '') {
    return `
      <article class="academy-kpi">
        <div class="academy-kpi-head">
          <span class="academy-kpi-icon">${esc(icon)}</span>
          <small>${esc(label)}</small>
        </div>
        <strong>${esc(value ?? 0)}</strong>
        <span class="academy-kpi-description">${esc(description)}</span>
      </article>
    `;
  }

  const academyDayNames = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

  function academyWeekdays(days) {
    return (days || []).map(x => academyDayNames[Number(x)] || x).join('، ');
  }

  async function openAcademyRecurringLive(onSaved) {
    const opts = await getOptions();
    const modal = document.getElementById('academyModal');
    const form = document.getElementById('academyModalForm');

    document.getElementById('academyModalTitle').textContent = 'جدول محاضرات متكرر';
    document.getElementById('academyModalSubtitle').textContent = 'حدد الأيام والوقت، وسيتم إنشاء الحصص تلقائيًا وإرسال التذكيرات للطلاب.';

    form.innerHTML = `
      <div class="field"><label>الدورة</label><select name="courseId" id="ownerSeriesCourse" required>
        <option value="">اختر الدورة...</option>
        ${(opts.courses||[]).map(x => '<option value="'+esc(x._id)+'">'+esc(x.title)+'</option>').join('')}
      </select></div>
      <div class="field"><label>المجموعة</label><select name="groupId" id="ownerSeriesGroup"><option value="">كل المجموعات</option></select></div>
      <div class="field"><label>المدرب</label><select name="instructorId" required>
        <option value="">اختر المدرب...</option>
        ${(opts.instructors||[]).map(x => '<option value="'+esc(x._id)+'">'+esc(x.name)+'</option>').join('')}
      </select></div>
      <div class="field"><label>العنوان</label><input name="title" required placeholder="مثال: البرمجة - المحاضرة المباشرة"></div>
      <div class="field"><label>تاريخ البداية</label><input name="startDate" type="date" required></div>
      <div class="field"><label>تاريخ النهاية</label><input name="endDate" type="date" required></div>
      <div class="field"><label>وقت الحصة</label><input name="time" type="time" required></div>
      <div class="field"><label>مدة الحصة بالدقائق</label><input name="durationMinutes" type="number" min="1" value="60" required></div>

      <div class="academy-note full">
        <b>أيام الحصص</b>
        <div class="academy-weekdays" id="ownerSeriesWeekdays">
          ${academyDayNames.map((name,index) => '<label><input type="checkbox" value="'+index+'"><span>'+esc(name)+'</span></label>').join('')}
        </div>
      </div>

      <div class="field"><label>التأخير بعد (دقائق)</label><input name="lateAfterMinutes" type="number" min="0" value="10"></div>
      <div class="field"><label>فتح الدخول قبل (دقائق)</label><input name="joinWindowBeforeMinutes" type="number" min="0" value="15"></div>
      <div class="field"><label>التذكير قبل (دقائق)</label><input name="reminderMinutes" type="number" min="0" max="1440" value="5"></div>
      <div class="field full"><label>الوصف</label><textarea name="description"></textarea></div>

      <label class="academy-note full"><input name="attendanceEnabled" type="checkbox" checked> تفعيل التحضير التلقائي</label>
      <label class="academy-note full"><input name="notifyInApp" type="checkbox" checked> تنبيه داخل AcademyFlow</label>
      <label class="academy-note full"><input name="notifyEmail" type="checkbox" checked> تذكير عبر البريد الإلكتروني</label>

      <div class="academy-form-message" id="ownerSeriesMessage"></div>
      <div class="academy-form-actions">
        <button class="btn ghost" id="ownerSeriesCancel" type="button">إلغاء</button>
        <button class="btn primary" type="submit">إنشاء الجدول</button>
      </div>
    `;

    modal.hidden = false;
    document.getElementById('ownerSeriesCancel').onclick = () => modal.hidden = true;

    const course = document.getElementById('ownerSeriesCourse');
    const group = document.getElementById('ownerSeriesGroup');
    course.onchange = () => {
      const rows = (opts.groups || []).filter(x => String(x.courseId) === String(course.value));
      group.innerHTML = '<option value="">كل المجموعات</option>'+
        rows.map(x => '<option value="'+esc(x._id)+'">'+esc(x.name)+'</option>').join('');
    };

    form.onsubmit = async e => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const msg = document.getElementById('ownerSeriesMessage');
      const payload = Object.fromEntries(new FormData(form).entries());

      payload.weekdays = [...document.querySelectorAll('#ownerSeriesWeekdays input:checked')].map(x => Number(x.value));
      payload.attendanceEnabled = form.elements.attendanceEnabled.checked;
      payload.notifyInApp = form.elements.notifyInApp.checked;
      payload.notifyEmail = form.elements.notifyEmail.checked;

      if (!payload.weekdays.length) {
        msg.textContent = 'اختر يومًا واحدًا على الأقل.';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'جاري إنشاء الحصص...';
      msg.textContent = '';

      try {
        const result = await api('/api/live-sessions/series',{
          method:'POST',
          body:JSON.stringify(payload)
        });

        modal.hidden = true;
        alert('تم إنشاء '+result.createdSessions+' حصة'+(result.zoomFailures ? '، منها '+result.zoomFailures+' تحتاج إعادة ربط Zoom.' : '.'));
        await onSaved();
      } catch (err) {
        msg.textContent = err.message;
      } finally {
        btn.disabled = false;
        btn.textContent = 'إنشاء الجدول';
      }
    };
  }

  async function renderLive() {
    const target = document.getElementById('pageContent');

    const config = {
      title:'جدولة محاضرة Zoom',
      editTitle:'تعديل المحاضرة',
      createRoles:['owner','admin'],
      manageRoles:['owner','admin'],
      updateEndpoint:'/api/live-sessions/:id',
      actions:{
        details:true,
        edit:true,
        extendField:'durationMinutes',
        extendLabel:'تمديد مدة المحاضرة',
        cancelStatus:'cancelled',
        cancelLabel:'إلغاء المحاضرة',
        reopenStatus:'scheduled',
        reopenLabel:'إعادة جدولة المحاضرة'
      },
      fields:[
        ['title','عنوان المحاضرة','text',true],
        ['courseId','الدورة','dynamicSelect',false,'courses'],
        ['groupId','المجموعة','dynamicSelect',false,'groups'],
        ['instructorId','المدرب','dynamicSelect',true,'instructors'],
        ['startAt','موعد البداية','datetime-local',true],
        ['durationMinutes','المدة بالدقائق','number',false],
        ['reminderMinutes','التذكير قبل (دقائق)','number',false],
        ['description','الوصف','textarea',false]
      ],
      endpoint:'/api/live-sessions'
    };

    target.innerHTML = `
      <section class="academy-card">
        <div class="academy-card-head">
          <div>
            <h2>جلسات Zoom</h2>
            <p>تعديل الموعد والمدة والإلغاء يتم من نفس الصفحة، وتتم مزامنة التغييرات مع Zoom عند تفعيل التكامل.</p>
          </div>
          ${allowed(config.createRoles) ? '<div class="academy-row-actions"><button class="btn soft" id="academyAddLiveSeries">+ جدول متكرر</button><button class="btn primary" id="academyAddLive">+ محاضرة</button></div>' : ''}
        </div>

        <div class="academy-note" style="margin-bottom:14px">
          الإلغاء لا يحذف السجل؛ يحتفظ النظام بالتفاصيل والحضور، ويمكن إعادة جدولة المحاضرة لاحقًا.
        </div>

        <div id="liveRows"><div class="academy-empty">جاري التحميل...</div></div>
      </section>

      <section class="academy-card academy-section">
        <div class="academy-card-head">
          <div><h2>الجداول المتكررة</h2><p>كل حصص الدورة التي تم إنشاؤها تلقائيًا حسب الأيام والأوقات.</p></div>
        </div>
        <div id="liveSeriesRows"><div class="academy-empty">جاري التحميل...</div></div>
      </section>
    `;

    let rows = [];

    const load = async () => {
      try {
        const [liveRows, seriesRows] = await Promise.all([
          api('/api/live-sessions'),
          allowed(['owner','admin']) ? api('/api/live-sessions/series') : Promise.resolve([])
        ]);
        rows = liveRows.map(row => ({
          ...row,
          startAtUtc: row.startAt,
          startAt: row.startAtLocal || row.startAt
        }));

        document.getElementById('liveRows').innerHTML = rows.length
          ? '<div class="academy-list">'+rows.map((x,index) => `
              <div class="academy-list-row">
                <div>
                  <b>${esc(x.title)}</b>
                  <span>
                    ${esc(x.startAtDisplay || fmtDate(x.startAtUtc || x.startAt,true))} ·
                    ${esc(x.durationMinutes || 60)} دقيقة ·
                    ${esc(x.courseId?.title || 'بدون دورة')} ·
                    ${esc(x.groupId?.name || 'كل المجموعات')} ·
                    ${esc(x.instructorId?.name || 'بدون مدرب')} ·
                    تذكير قبل ${esc(x.reminderMinutes ?? 5)} د
                  </span>
                  <span class="academy-live-reminder-stats">
                    ${x.reminderCompletedAt
                      ? 'التذكير: داخل الموقع '+esc(x.reminderStats?.inApp || 0)+' · Email '+esc(x.reminderStats?.email || 0)+(Number(x.reminderStats?.emailFailed || 0)?' · فشل '+esc(x.reminderStats.emailFailed):'')
                      : 'التذكير لم يُرسل بعد'}
                  </span>
                </div>

                <div class="academy-row-actions">
                  ${status(x.status)}
                  <button class="btn soft live-action" data-action="details" data-index="${index}" type="button">تفاصيل</button>
                  ${allowed(config.manageRoles) ? '<button class="btn soft live-action" data-action="edit" data-index="'+index+'" type="button">تعديل</button>' : ''}
                  ${allowed(config.manageRoles) && x.status !== 'cancelled' ? '<button class="btn soft live-action" data-action="extend" data-index="'+index+'" type="button">تمديد</button>' : ''}
                  ${allowed(config.manageRoles)
                    ? '<button class="btn '+(x.status==='cancelled'?'primary':'ghost')+' live-action" data-action="'+(x.status==='cancelled'?'reopen':'cancel')+'" data-index="'+index+'" type="button">'+
                        (x.status==='cancelled'?'إعادة الجدولة':'إلغاء')+
                      '</button>'
                    : ''}
                  ${!x.zoomJoinUrl && x.status === 'scheduled' && allowed(config.manageRoles)
                    ? '<button class="btn soft live-action" data-action="reconnect" data-index="'+index+'" type="button">إنشاء رابط Zoom</button>'
                    : ''}
                  ${x.zoomJoinUrl && x.status !== 'cancelled'
                    ? '<a class="btn soft" target="_blank" rel="noopener" href="'+esc(x.zoomJoinUrl)+'">Zoom</a>'
                    : ''}
                </div>
              </div>
            `).join('')+'</div>'
          : '<div class="academy-empty">لا توجد محاضرات مجدولة.</div>';

        document.getElementById('liveSeriesRows').innerHTML = seriesRows.length
          ? '<div class="academy-list">'+seriesRows.map((s,index) => `
              <div class="academy-list-row">
                <div>
                  <b>${esc(s.title)}</b>
                  <span>${esc(s.courseId?.title || '')} · ${esc(s.groupId?.name || 'كل المجموعات')} · ${academyWeekdays(s.weekdays)} · ${esc(s.time)} · ${esc(s.sessionCount)} حصة</span>
                  <small>${esc(s.startDate)} → ${esc(s.endDate)} · تذكير قبل ${esc(s.reminderMinutes)} د</small>
                </div>
                <div class="academy-row-actions">
                  ${status(s.status)}
                  ${s.status === 'active' ? '<button class="btn ghost owner-series-cancel" data-index="'+index+'" type="button">إلغاء الحصص القادمة</button>' : ''}
                </div>
              </div>
            `).join('')+'</div>'
          : '<div class="academy-empty">لا توجد جداول متكررة حتى الآن.</div>';

        document.querySelectorAll('.owner-series-cancel').forEach(btn => {
          btn.onclick = async () => {
            const series = seriesRows[Number(btn.dataset.index)];
            if (!series || !confirm('إلغاء جميع الحصص القادمة في هذا الجدول؟')) return;

            try {
              const result = await api('/api/live-sessions/series/'+encodeURIComponent(series._id)+'/cancel-future',{ method:'PATCH' });
              alert('تم إلغاء '+result.cancelled+' حصة قادمة.');
              await load();
            } catch (err) {
              alert(err.message);
            }
          };
        });

        document.querySelectorAll('.live-action').forEach(btn => {
          btn.onclick = () => {
            const row = rows[Number(btn.dataset.index)];
            if (!row) return;

            if (btn.dataset.action === 'details') return openDetails(config,row);
            if (btn.dataset.action === 'edit') return openForm(config,load,row);
            if (btn.dataset.action === 'extend') return openExtend(config,row,load);

            if (btn.dataset.action === 'reconnect') {
              return api(
                config.updateEndpoint.replace(':id',encodeURIComponent(row.id || row._id)),
                { method:'PATCH', body:JSON.stringify({}) }
              ).then(updated => {
                if (!updated.zoomMeetingId && !updated.zoomJoinUrl) {
                  alert('تكامل Zoom غير مفعل في إعدادات السيرفر.');
                }
                return load();
              }).catch(err => alert(err.message));
            }

            if (btn.dataset.action === 'cancel') {
              return changeRecordStatus(
                config,row,'cancelled','إلغاء المحاضرة',load
              );
            }

            if (btn.dataset.action === 'reopen') {
              return changeRecordStatus(
                config,row,'scheduled','إعادة جدولة المحاضرة',load
              );
            }
          };
        });
      } catch (err) {
        document.getElementById('liveRows').innerHTML =
          '<div class="academy-empty">'+esc(err.message)+'</div>';
      }
    };

    if (allowed(config.createRoles)) {
      document.getElementById('academyAddLive').onclick =
        () => openForm(config,load);

      document.getElementById('academyAddLiveSeries').onclick =
        () => openAcademyRecurringLive(load);
    }

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
    target.innerHTML = '<div class="academy-empty">جاري تحميل التقويم...</div>';

    try {
      const rows = await api('/api/live-sessions');
      const sessions = rows.slice().sort((a,b) => new Date(a.startAt) - new Date(b.startAt));
      const today = calendarTodayKey();
      const initialKey = today;
      let selectedKey = initialKey;
      let visibleMonth = calendarMonthFromKey(initialKey);

      target.innerHTML = `
        <section class="academy-card">
          <div class="academy-calendar-toolbar">
            <div>
              <h2 style="margin:0 0 5px">التقويم</h2>
              <p style="margin:0;color:var(--text-mute);font-size:10.5px">اختَر أي يوم وبتطلع لك كل المحاضرات المجدولة فيه.</p>
            </div>
            <a class="btn primary" href="/academy/live.html">إدارة المحاضرات</a>
          </div>

          <div class="academy-calendar-toolbar">
            <div class="academy-calendar-month" id="calendarMonthLabel"></div>
            <div class="academy-calendar-nav">
              <button class="btn secondary" type="button" id="calendarNextMonth">الشهر التالي</button>
              <button class="btn soft" type="button" id="calendarToday">اليوم</button>
              <button class="btn secondary" type="button" id="calendarPrevMonth">الشهر السابق</button>
            </div>
          </div>

          <div class="academy-calendar-shell">
            <div class="academy-calendar-board">
              <div class="academy-calendar-scroll">
                <div class="academy-calendar-grid" id="academyCalendarGrid" aria-label="تقويم المحاضرات"></div>
              </div>
            </div>

            <aside class="academy-card academy-calendar-agenda" style="box-shadow:none">
              <h3 class="academy-calendar-agenda-title">مواعيد اليوم</h3>
              <span class="academy-calendar-agenda-date" id="calendarSelectedDate"></span>
              <div class="academy-calendar-events" id="calendarDayEvents"></div>
            </aside>
          </div>
        </section>
      `;

      const grid = document.getElementById('academyCalendarGrid');
      const monthLabel = document.getElementById('calendarMonthLabel');
      const selectedDate = document.getElementById('calendarSelectedDate');
      const eventsTarget = document.getElementById('calendarDayEvents');

      const byDay = sessions.reduce((acc,row) => {
        const key = calendarSessionKey(row);
        if (!key) return acc;
        (acc[key] ||= []).push(row);
        return acc;
      }, {});

      function drawMonth() {
        const year = visibleMonth.getFullYear();
        const month = visibleMonth.getMonth();
        monthLabel.textContent = new Intl.DateTimeFormat('ar-OM', {month:'long', year:'numeric'}).format(new Date(year,month,1));

        const weekDays = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
        const first = new Date(year,month,1);
        const startDate = new Date(year,month,1-first.getDay());

        let html = weekDays.map(day => '<div class="academy-calendar-weekday">'+day+'</div>').join('');

        for (let i=0;i<42;i++) {
          const d = new Date(startDate);
          d.setDate(startDate.getDate()+i);
          const key = calendarDateKey(d);
          const dayRows = byDay[key] || [];
          const outside = d.getMonth() !== month;
          const previews = dayRows.slice(0,2).map(x => '<span>'+esc(x.title)+'</span>').join('');
          const more = dayRows.length > 2 ? '<span class="academy-calendar-more">+'+(dayRows.length-2)+' مواعيد</span>' : '';

          html += `
            <button type="button"
              class="academy-calendar-day${outside ? ' is-outside' : ''}${key === selectedKey ? ' is-selected' : ''}${key === today ? ' is-today' : ''}"
              data-calendar-date="${key}"
              aria-pressed="${key === selectedKey ? 'true' : 'false'}">
              <span class="academy-calendar-date">${d.getDate()}</span>
              ${dayRows.length ? '<span class="academy-calendar-count">'+dayRows.length+'</span>' : ''}
              <span class="academy-calendar-preview">${previews}${more}</span>
            </button>
          `;
        }

        grid.innerHTML = html;
        grid.querySelectorAll('[data-calendar-date]').forEach(btn => {
          btn.addEventListener('click', () => {
            selectedKey = btn.dataset.calendarDate;
            const picked = calendarMonthFromKey(selectedKey);
            if (picked.getMonth() !== visibleMonth.getMonth() || picked.getFullYear() !== visibleMonth.getFullYear()) {
              visibleMonth = picked;
            }
            drawMonth();
            drawDay();
          });
        });
      }

      function drawDay() {
        const dayRows = (byDay[selectedKey] || []).slice().sort((a,b) => new Date(a.startAt) - new Date(b.startAt));
        selectedDate.textContent = calendarLongDate(selectedKey);

        if (!dayRows.length) {
          eventsTarget.innerHTML = '<div class="academy-calendar-empty">ما فيه أي محاضرات مجدولة في هذا اليوم.</div>';
          return;
        }

        eventsTarget.innerHTML = dayRows.map(x => {
          const course = x.courseId?.title || '';
          const instructor = x.instructorId?.name || '';
          const group = x.groupId?.name || '';
          return `
            <article class="academy-calendar-event">
              <div class="academy-calendar-event-head">
                <div>
                  <h3>${esc(x.title)}</h3>
                  <div class="academy-calendar-event-meta">
                    <span>الوقت: ${esc(calendarSessionTime(x))}</span>
                    <span>المدة: ${esc(x.durationMinutes || 60)} دقيقة</span>
                    ${course ? '<span>الدورة: '+esc(course)+'</span>' : ''}
                    ${group ? '<span>المجموعة: '+esc(group)+'</span>' : ''}
                    ${instructor ? '<span>المدرب: '+esc(instructor)+'</span>' : ''}
                  </div>
                </div>
                ${status(x.status)}
              </div>
              ${x.description ? '<p style="margin:9px 0 0;color:var(--text-mute);font-size:9.5px;line-height:1.7">'+esc(x.description)+'</p>' : ''}
              <div class="academy-calendar-event-actions">
                ${x.zoomJoinUrl ? '<a class="btn soft" target="_blank" rel="noopener" href="'+esc(x.zoomJoinUrl)+'">فتح Zoom</a>' : ''}
                <a class="btn secondary" href="/academy/live.html">تفاصيل المحاضرة</a>
              </div>
            </article>
          `;
        }).join('');
      }

      document.getElementById('calendarPrevMonth').addEventListener('click', () => {
        visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth()-1, 1);
        drawMonth();
      });

      document.getElementById('calendarNextMonth').addEventListener('click', () => {
        visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth()+1, 1);
        drawMonth();
      });

      document.getElementById('calendarToday').addEventListener('click', () => {
        selectedKey = today;
        visibleMonth = calendarMonthFromKey(today);
        drawMonth();
        drawDay();
      });

      drawMonth();
      drawDay();
    } catch (err) {
      target.innerHTML = '<div class="academy-card academy-empty">'+esc(err.message)+'</div>';
    }
  }

function calendarTodayKey() {
    const d = new Date();
    return calendarDateKey(d);
  }

function calendarDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth()+1).padStart(2,'0');
    const d = String(date.getDate()).padStart(2,'0');
    return y+'-'+m+'-'+d;
  }

function calendarSessionKey(row) {
    if (row?.startAtLocal) return String(row.startAtLocal).slice(0,10);
    if (!row?.startAt) return '';
    const timezone = row.timezone || 'Asia/Muscat';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year:'numeric',
      month:'2-digit',
      day:'2-digit'
    }).formatToParts(new Date(row.startAt));
    const map = Object.fromEntries(parts.map(x => [x.type,x.value]));
    return map.year+'-'+map.month+'-'+map.day;
  }

function calendarMonthFromKey(key) {
    const parts = String(key).split('-').map(Number);
    return new Date(parts[0], Math.max(0,(parts[1] || 1)-1), 1);
  }

function calendarLongDate(key) {
    const parts = String(key).split('-').map(Number);
    const d = new Date(parts[0], Math.max(0,(parts[1] || 1)-1), parts[2] || 1);
    return new Intl.DateTimeFormat('ar-OM', {
      weekday:'long',
      day:'numeric',
      month:'long',
      year:'numeric'
    }).format(d);
  }

function calendarSessionTime(row) {
    try {
      const timezone = row.timezone || 'Asia/Muscat';
      return new Intl.DateTimeFormat('ar-OM', {
        timeZone: timezone,
        hour:'numeric',
        minute:'2-digit'
      }).format(new Date(row.startAt));
    } catch (_) {
      return String(row.startAtDisplay || row.startAtLocal || '').slice(11,16) || '—';
    }
  }

  async function renderSettings() {
    const target = document.getElementById('pageContent');
    target.innerHTML = '<div class="academy-empty">جاري تحميل الإعدادات...</div>';

    let s;

    try {
      // Settings must never wait for SMTP/network diagnostics.
      s = await api('/api/academy/settings');
    } catch (err) {
      target.innerHTML = '<div class="academy-card academy-empty">'+esc(err.message)+'</div>';
      return;
    }

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

      <section class="academy-card academy-section" id="academyZoomSection">
        <div class="academy-card-head">
          <div>
            <h2>تكامل Zoom</h2>
            <p>كل أكاديمية تربط حساب Zoom الخاص بها، وتُنشأ المحاضرات من حسابها مباشرة.</p>
          </div>
          <div id="academyZoomState"><span class="academy-status info">جاري فحص الربط...</span></div>
        </div>

        <div class="academy-details-grid" id="academyZoomDetails">
          <div class="academy-detail-item"><small>الحالة</small><div>جاري قراءة حالة Zoom...</div></div>
          <div class="academy-detail-item"><small>الحساب المرتبط</small><div>—</div></div>
          <div class="academy-detail-item"><small>تاريخ الربط</small><div>—</div></div>
          <div class="academy-detail-item"><small>نوع الربط</small><div>User-managed OAuth</div></div>
        </div>

        <div class="academy-note" style="margin-top:12px">
          بيانات Zoom السرية محفوظة في Railway، وتوكنات كل أكاديمية تُحفظ مشفّرة في قاعدة البيانات.
          ${user.role === 'owner' ? 'المالك فقط يقدر يربط أو يفصل حساب Zoom.' : 'ربط الحساب أو فصله متاح لمالك الأكاديمية فقط.'}
        </div>

        <div class="academy-row-actions" style="margin-top:12px">
          ${user.role === 'owner' ? `
            <button class="btn primary" id="academyConnectZoom" type="button">ربط حساب Zoom</button>
            <button class="btn soft" id="academyDisconnectZoom" type="button" hidden>فصل حساب Zoom</button>
          ` : ''}
          <button class="btn soft" id="academyRefreshZoomStatus" type="button">تحديث حالة Zoom</button>
          <span id="academyZoomMsg" class="academy-note"></span>
        </div>
      </section>

      <section class="academy-card academy-section" id="academyEmailSection">
        <div class="academy-card-head">
          <div>
            <h2>البريد الإلكتروني والتنبيهات</h2>
            <p>الإرسال يستخدم SendGrid عبر HTTPS، لذلك يناسب Railway بدون الحاجة إلى SMTP.</p>
          </div>
          <div id="academyEmailState"><span class="academy-status info">جاري فحص الإعداد...</span></div>
        </div>

        <div class="academy-details-grid" id="academyEmailDetails">
          <div class="academy-detail-item"><small>الحالة</small><div>جاري قراءة إعدادات البريد...</div></div>
          <div class="academy-detail-item"><small>مزود البريد</small><div>SendGrid</div></div>
          <div class="academy-detail-item"><small>البريد المرسل منه</small><div>—</div></div>
          <div class="academy-detail-item"><small>اسم المرسل</small><div>AcademyFlow</div></div>
          <div class="academy-detail-item"><small>API Key</small><div>—</div></div>
        </div>

        <div class="academy-note" style="margin-top:12px">
          <b>المطلوب في Railway Variables:</b>
          <code>SENDGRID_API_KEY</code> +
          <code>SENDGRID_FROM_EMAIL</code> +
          <code>SENDGRID_FROM_NAME</code> +
          <code>PUBLIC_URL</code>.
          لازم يكون <code>SENDGRID_FROM_EMAIL</code> هو نفس البريد الذي وثقته في Single Sender Verification.
        </div>

        <div class="academy-row-actions" style="margin-top:12px">
          <button class="btn primary" id="academyTestEmail" type="button">إرسال بريد تجريبي</button>
          <button class="btn soft" id="academyRefreshEmailStatus" type="button">تحديث حالة البريد</button>
          <span id="academyTestEmailMsg" class="academy-note"></span>
        </div>
      </section>

      <section class="academy-card academy-section">
        <div class="academy-note">
          كود الأكاديمية: <b>${esc(s.code)}</b> · الحالة: <b>${esc(s.status)}</b>.
          هذه القيم يديرها مالك منصة AcademyFlow وليست قابلة للتغيير من إعدادات الأكاديمية.
        </div>
      </section>
    `;

    const zoomState = document.getElementById('academyZoomState');
    const zoomDetails = document.getElementById('academyZoomDetails');
    const zoomMsg = document.getElementById('academyZoomMsg');
    const zoomConnect = document.getElementById('academyConnectZoom');
    const zoomDisconnect = document.getElementById('academyDisconnectZoom');
    const zoomRefresh = document.getElementById('academyRefreshZoomStatus');

    const showZoomMessageFromRedirect = () => {
      const params = new URLSearchParams(location.search);
      const result = params.get('zoom');
      if (!result || !zoomMsg) return;

      if (result === 'connected') {
        zoomMsg.style.color = 'var(--success)';
        zoomMsg.textContent = 'تم ربط حساب Zoom بنجاح.';
      } else if (result === 'declined') {
        zoomMsg.style.color = 'var(--text-mute)';
        zoomMsg.textContent = 'تم إلغاء عملية ربط Zoom.';
      } else if (result === 'error') {
        zoomMsg.style.color = 'var(--danger)';
        zoomMsg.textContent = 'تعذر إكمال ربط Zoom. حاول الربط مرة ثانية.';
      }

      params.delete('zoom');
      params.delete('reason');
      const query = params.toString();
      history.replaceState({}, '', location.pathname + (query ? '?' + query : ''));
    };

    const loadZoomStatus = async () => {
      if (!zoomState || !zoomDetails) return;
      zoomState.innerHTML = '<span class="academy-status info">جاري الفحص...</span>';

      try {
        const z = await api('/api/zoom/status');

        if (!z.appConfigured) {
          zoomState.innerHTML = '<span class="academy-status bad">إعداد السيرفر ناقص</span>';
        } else if (z.connected) {
          zoomState.innerHTML = '<span class="academy-status good">متصل</span>';
        } else {
          zoomState.innerHTML = '<span class="academy-status warn">غير متصل</span>';
        }

        zoomDetails.innerHTML = `
          <div class="academy-detail-item"><small>الحالة</small><div>${z.connected ? 'حساب Zoom مربوط وجاهز لإنشاء المحاضرات.' : (z.appConfigured ? 'التطبيق جاهز، لكن الأكاديمية ما ربطت حساب Zoom بعد.' : 'أضف متغيرات Zoom المطلوبة في Railway أولاً.')}</div></div>
          <div class="academy-detail-item"><small>الحساب المرتبط</small><div>${esc(z.displayName || z.email || '—')}${z.email && z.displayName ? '<br><small>'+esc(z.email)+'</small>' : ''}</div></div>
          <div class="academy-detail-item"><small>تاريخ الربط</small><div>${z.connectedAt ? fmtDate(z.connectedAt,true) : '—'}</div></div>
          <div class="academy-detail-item"><small>نوع الربط</small><div>User-managed OAuth</div></div>
        `;

        if (zoomConnect) {
          zoomConnect.hidden = Boolean(z.connected);
          zoomConnect.disabled = !z.appConfigured;
        }
        if (zoomDisconnect) zoomDisconnect.hidden = !z.connected;
      } catch (err) {
        zoomState.innerHTML = '<span class="academy-status bad">تعذر الفحص</span>';
        zoomDetails.innerHTML = '<div class="academy-detail-item" style="grid-column:1/-1"><small>السبب</small><div>'+esc(err.message)+'</div></div>';
      }
    };

    if (zoomConnect) {
      zoomConnect.onclick = async () => {
        const original = zoomConnect.textContent;
        zoomConnect.disabled = true;
        zoomConnect.textContent = 'جاري فتح Zoom...';
        if (zoomMsg) zoomMsg.textContent = '';

        try {
          const result = await api('/api/zoom/connect', { method:'POST' });
          if (!result?.authorizationUrl) throw new Error('تعذر إنشاء رابط تفويض Zoom');
          location.href = result.authorizationUrl;
        } catch (err) {
          if (zoomMsg) {
            zoomMsg.style.color = 'var(--danger)';
            zoomMsg.textContent = err.message;
          }
          zoomConnect.disabled = false;
          zoomConnect.textContent = original;
        }
      };
    }

    if (zoomDisconnect) {
      zoomDisconnect.onclick = async () => {
        if (!confirm('متأكد تريد تفصل حساب Zoom عن الأكاديمية؟')) return;
        zoomDisconnect.disabled = true;
        if (zoomMsg) zoomMsg.textContent = '';

        try {
          await api('/api/zoom/disconnect', { method:'POST' });
          if (zoomMsg) {
            zoomMsg.style.color = 'var(--success)';
            zoomMsg.textContent = 'تم فصل حساب Zoom.';
          }
          await loadZoomStatus();
        } catch (err) {
          if (zoomMsg) {
            zoomMsg.style.color = 'var(--danger)';
            zoomMsg.textContent = err.message;
          }
        } finally {
          zoomDisconnect.disabled = false;
        }
      };
    }

    if (zoomRefresh) zoomRefresh.onclick = loadZoomStatus;

    showZoomMessageFromRedirect();
    loadZoomStatus();

    const loadEmailStatus = async () => {
      const state = document.getElementById('academyEmailState');
      const details = document.getElementById('academyEmailDetails');

      if (!state || !details) return;

      state.innerHTML = '<span class="academy-status info">جاري الفحص...</span>';

      try {
        const emailStatus = await api('/api/academy/email/status');

        state.innerHTML = emailStatus.configured
          ? '<span class="academy-status good">جاهز للإرسال</span>'
          : '<span class="academy-status bad">ناقص إعداد</span>';

        const reason = emailStatus.configured
          ? 'SendGrid جاهز. البريد التجريبي وتذكيرات الطلاب سيستخدمان Single Sender الموثّق.'
          : 'المتغيرات الناقصة: '+((emailStatus.missing || []).join(', ') || 'غير معروفة');

        details.innerHTML = `
          <div class="academy-detail-item"><small>الحالة</small><div>${esc(reason)}</div></div>
          <div class="academy-detail-item"><small>مزود البريد</small><div>SendGrid · HTTPS API</div></div>
          <div class="academy-detail-item"><small>البريد المرسل منه</small><div>${esc(emailStatus.fromEmail || '—')}</div></div>
          <div class="academy-detail-item"><small>اسم المرسل</small><div>${esc(emailStatus.fromName || 'AcademyFlow')}</div></div>
          <div class="academy-detail-item"><small>API Key</small><div>${emailStatus.apiKeyPresent ? 'موجود ومخفي' : 'غير موجود'}</div></div>
          <div class="academy-detail-item"><small>Reply-To</small><div>${esc(emailStatus.replyTo || '—')}</div></div>
        `;
      } catch (err) {
        state.innerHTML = '<span class="academy-status bad">تعذر قراءة حالة البريد</span>';
        details.innerHTML = `
          <div class="academy-detail-item" style="grid-column:1/-1">
            <small>السبب</small>
            <div>${esc(err.message)}</div>
          </div>
        `;
      }
    };

    document.getElementById('academyRefreshEmailStatus').onclick = loadEmailStatus;

    document.getElementById('academyTestEmail').onclick = async e => {
      const button = e.currentTarget;
      const msg = document.getElementById('academyTestEmailMsg');
      const original = button.textContent;

      button.disabled = true;
      button.textContent = 'جاري الاختبار...';
      msg.textContent = '';

      try {
        const result = await api('/api/academy/email/test',{method:'POST'});
        msg.style.color = 'var(--success)';
        msg.textContent = 'تم إرسال رسالة اختبار إلى '+result.to+'. افحص الوارد والرسائل غير المرغوب فيها.';
      } catch (err) {
        msg.style.color = 'var(--danger)';

        const missing = Array.isArray(err.data?.missing) && err.data.missing.length
          ? ' · الناقص: '+err.data.missing.join(', ')
          : '';

        msg.textContent =
          err.message +
          missing +
          (err.data?.error ? ' · '+err.data.error : '');
      } finally {
        button.disabled = false;
        button.textContent = original;
      }
    };

    document.getElementById('settingsForm').onsubmit = async e => {
      e.preventDefault();

      const form = e.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      const original = button.textContent;
      const fd = new FormData(form);
      const payload = { branding:{} };

      for (const [k,v] of fd.entries()) {
        if (k.startsWith('branding.')) payload.branding[k.split('.')[1]] = v;
        else payload[k] = v;
      }

      const msg = document.getElementById('settingsMsg');
      button.disabled = true;
      button.textContent = 'جاري الحفظ...';
      msg.textContent = '';

      try {
        await api('/api/academy/settings',{
          method:'PATCH',
          body:JSON.stringify(payload)
        });

        msg.style.color = 'var(--success)';
        msg.textContent = 'تم حفظ الإعدادات بنجاح.';
      } catch (err) {
        msg.style.color = 'var(--danger)';
        msg.textContent = err.message;
      } finally {
        button.disabled = false;
        button.textContent = original;
      }
    };

    // Deliberately not awaited: email diagnostics can never block the settings page.
    loadEmailStatus();
  }

  function certificateFileSize(bytes) {
    const value = Number(bytes || 0);
    if (!value) return '—';
    if (value < 1024 * 1024) return Math.max(1, Math.round(value / 1024)) + ' KB';
    return (value / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async function renderCertificatesPage() {
    const target = document.getElementById('pageContent');
    target.innerHTML = '<div class="academy-empty">جاري تحميل الشهادات...</div>';

    try {
      const opts = await getOptions();

      target.innerHTML = `
        <section class="academy-certificate-layout">
          <article class="academy-card academy-certificate-upload-card">
            <div class="academy-card-head">
              <div>
                <span class="academy-section-label">إصدار شهادة</span>
                <h2>رفع شهادة PDF</h2>
                <p>ارفع النسخة النهائية للشهادة وسيتم إتاحتها للطالب مباشرة داخل حسابه.</p>
              </div>
            </div>

            <form id="certificateUploadForm" class="academy-certificate-form">
              <div class="field">
                <label>الطالب</label>
                <select name="studentId" required>
                  <option value="">اختر الطالب...</option>
                  ${(opts.students || []).map(x => '<option value="'+esc(x._id)+'">'+esc(x.name)+' · '+esc(x.email || '')+'</option>').join('')}
                </select>
              </div>
              <div class="field">
                <label>الدورة</label>
                <select name="courseId" required>
                  <option value="">اختر الدورة...</option>
                  ${(opts.courses || []).map(x => '<option value="'+esc(x._id)+'">'+esc(x.title)+(x.code ? ' · '+esc(x.code) : '')+'</option>').join('')}
                </select>
              </div>
              <div class="field">
                <label>رقم الشهادة <span style="font-weight:400;color:var(--text-mute)">(اختياري)</span></label>
                <input name="certificateNo" placeholder="يُنشأ تلقائيًا إذا تركته فارغًا">
              </div>
              <div class="field">
                <label>تاريخ الإصدار</label>
                <input name="issuedAt" type="date">
              </div>
              <div class="academy-certificate-file full">
                <label for="certificatePdf">ملف الشهادة PDF</label>
                <input id="certificatePdf" name="pdf" type="file" accept="application/pdf,.pdf" required>
                <span>PDF فقط · الحد الأقصى 10MB · الملف لا يكون عامًا على الإنترنت.</span>
              </div>
              <div class="academy-form-message full" id="certificateUploadMessage"></div>
              <div class="academy-form-actions full">
                <button class="btn primary" type="submit">رفع وإرسال للطالب</button>
              </div>
            </form>
          </article>

          <aside class="academy-certificate-help">
            <article class="academy-card">
              <span class="academy-section-label">آلية العمل</span>
              <h3 style="margin:0 0 9px">الشهادة تصل للطالب تلقائيًا</h3>
              <p style="margin:0;color:var(--text-mute);font-size:12px;line-height:1.8">بعد الرفع، يظهر للطالب إشعار جديد وتظهر الشهادة في صفحة “شهاداتي” مع فتح وحفظ PDF.</p>
            </article>
            <article class="academy-card academy-certificate-security">
              <span class="academy-section-label">الخصوصية</span>
              <b>ملفات كل أكاديمية معزولة</b>
              <p>لا يستطيع طالب أو أكاديمية أخرى الوصول إلى ملف الشهادة.</p>
            </article>
          </aside>
        </section>

        <section class="academy-section">
          <div class="academy-certificate-summary" id="certificateSummary"></div>
          <div class="academy-card">
            <div class="academy-card-head">
              <div>
                <span class="academy-section-label">سجل الشهادات</span>
                <h2>الشهادات المرسلة</h2>
                <p>افتح الملف أو نزّله أو استبدله أو ألغِ ظهوره للطالب.</p>
              </div>
              <input class="academy-search" id="certificateSearch" placeholder="بحث باسم الطالب أو الدورة أو رقم الشهادة">
            </div>
            <div id="certificateRows"><div class="academy-empty">جاري التحميل...</div></div>
          </div>
        </section>
      `;

      let rows = [];

      const draw = () => {
        const q = (document.getElementById('certificateSearch')?.value || '').trim().toLowerCase();
        const visible = q
          ? rows.filter(x => JSON.stringify({
              no:x.certificateNo,
              student:x.studentId?.name,
              email:x.studentId?.email,
              course:x.courseId?.title,
              code:x.courseId?.code
            }).toLowerCase().includes(q))
          : rows;

        const issued = rows.filter(x => x.status === 'issued').length;
        const withPdf = rows.filter(x => x.hasPdf).length;
        const downloads = rows.reduce((sum,x) => sum + Number(x.downloadCount || 0), 0);

        document.getElementById('certificateSummary').innerHTML = `
          <article><small>إجمالي الشهادات</small><strong>${rows.length}</strong></article>
          <article><small>متاحة للطلاب</small><strong>${issued}</strong></article>
          <article><small>ملفات PDF</small><strong>${withPdf}</strong></article>
          <article><small>مرات الحفظ/الفتح</small><strong>${downloads}</strong></article>
        `;

        document.getElementById('certificateRows').innerHTML = visible.length
          ? '<div class="academy-certificate-grid">'+visible.map(x => `
              <article class="academy-certificate-item">
                <div class="academy-certificate-item-top">
                  <div class="academy-certificate-pdf">PDF</div>
                  <div>
                    <div class="academy-certificate-title">${esc(x.studentId?.name || 'طالب')}</div>
                    <div class="academy-certificate-course">${esc(x.courseId?.title || 'دورة')}</div>
                  </div>
                  ${status(x.status)}
                </div>
                <div class="academy-certificate-meta">
                  <span><b>رقم الشهادة</b>${esc(x.certificateNo)}</span>
                  <span><b>تاريخ الإصدار</b>${fmtDate(x.issuedAt)}</span>
                  <span><b>الملف</b>${x.hasPdf ? esc(x.fileName)+' · '+certificateFileSize(x.fileSize) : 'لا يوجد PDF'}</span>
                  <span><b>أُرسلت للطالب</b>${x.deliveredAt ? fmtDate(x.deliveredAt,true) : '—'}</span>
                </div>
                <div class="academy-certificate-actions">
                  ${x.hasPdf ? '<a class="btn soft" target="_blank" rel="noopener" href="/api/academy/certificates/'+esc(x._id)+'/file">فتح PDF</a>' : ''}
                  ${x.hasPdf ? '<a class="btn ghost" href="/api/academy/certificates/'+esc(x._id)+'/file?download=1">تنزيل</a>' : ''}
                  <button class="btn ghost certificate-replace" data-id="${esc(x._id)}" type="button">استبدال الملف</button>
                  <button class="btn ${x.status==='issued'?'ghost':'soft'} certificate-status" data-id="${esc(x._id)}" data-status="${x.status==='issued'?'revoked':'issued'}" type="button">${x.status==='issued'?'إلغاء الشهادة':'إعادة الإتاحة'}</button>
                </div>
              </article>
            `).join('')+'</div>'
          : '<div class="academy-empty">لا توجد شهادات مطابقة.</div>';

        document.querySelectorAll('.certificate-replace').forEach(btn => {
          btn.onclick = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'application/pdf,.pdf';
            input.onchange = async () => {
              const file = input.files?.[0];
              if (!file) return;
              if (file.size > 10 * 1024 * 1024) return alert('حجم الملف يجب ألا يتجاوز 10MB');
              btn.disabled = true;
              try {
                await api('/api/academy/certificates/'+encodeURIComponent(btn.dataset.id)+'/file?fileName='+encodeURIComponent(file.name), {
                  method:'PUT',
                  headers:{'Content-Type':'application/pdf'},
                  body:file
                });
                await load();
              } catch (err) {
                alert(err.message);
              } finally {
                btn.disabled = false;
              }
            };
            input.click();
          };
        });

        document.querySelectorAll('.certificate-status').forEach(btn => {
          btn.onclick = async () => {
            btn.disabled = true;
            try {
              await api('/api/academy/certificates/'+encodeURIComponent(btn.dataset.id)+'/status', {
                method:'PATCH',
                body:JSON.stringify({status:btn.dataset.status})
              });
              await load();
            } catch (err) {
              alert(err.message);
            } finally {
              btn.disabled = false;
            }
          };
        });
      };

      const load = async () => {
        rows = await api('/api/academy/certificates');
        draw();
      };

      document.getElementById('certificateSearch').addEventListener('input', draw);

      document.getElementById('certificateUploadForm').onsubmit = async e => {
        e.preventDefault();
        const form = e.currentTarget;
        const button = form.querySelector('button[type="submit"]');
        const msg = document.getElementById('certificateUploadMessage');
        const fd = new FormData(form);
        const file = fd.get('pdf');

        msg.textContent = '';
        msg.style.color = 'var(--danger)';

        if (!(file instanceof File) || !file.size) {
          msg.textContent = 'اختر ملف PDF للشهادة.';
          return;
        }
        if (file.size > 10 * 1024 * 1024) {
          msg.textContent = 'حجم ملف الشهادة يجب ألا يتجاوز 10MB.';
          return;
        }
        if (file.type && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
          msg.textContent = 'يُسمح بملفات PDF فقط.';
          return;
        }

        const params = new URLSearchParams({
          studentId:String(fd.get('studentId') || ''),
          courseId:String(fd.get('courseId') || ''),
          certificateNo:String(fd.get('certificateNo') || ''),
          issuedAt:String(fd.get('issuedAt') || ''),
          fileName:file.name
        });

        const original = button.textContent;
        button.disabled = true;
        button.textContent = 'جاري الرفع...';

        try {
          await api('/api/academy/certificates/upload?'+params.toString(), {
            method:'POST',
            headers:{'Content-Type':'application/pdf'},
            body:file
          });
          form.reset();
          msg.style.color = 'var(--success)';
          msg.textContent = 'تم رفع الشهادة وإرسالها للطالب بنجاح.';
          await load();
        } catch (err) {
          msg.textContent = err.message;
        } finally {
          button.disabled = false;
          button.textContent = original;
        }
      };

      await load();
    } catch (err) {
      target.innerHTML = '<div class="academy-card academy-empty">'+esc(err.message)+'</div>';
    }
  }

  function settingsInput(name,label,value,type='text') {
    return '<div class="field"><label>'+esc(label)+'</label><input name="'+esc(name)+'" type="'+esc(type)+'" value="'+esc(value || '')+'"></div>';
  }

  async function init() {
    renderShell();
    window.AcademyFlowWorkspace?.enhance(document.getElementById('academyApp'));

    const restricted = navGroups.flatMap(x => x.items).find(x => x[0] === page);
    if (restricted && !allowed(restricted[3])) {
      document.getElementById('pageContent').innerHTML = '<div class="academy-card academy-empty">ما عندك صلاحية للوصول إلى هذه الصفحة.</div>';
      return;
    }

    if (page === 'quiz-builder' && !allowed(['owner','admin','content_manager'])) {
      document.getElementById('pageContent').innerHTML = '<div class="academy-card academy-empty">ما عندك صلاحية للوصول إلى هذه الصفحة.</div>';
      return;
    }
    if (page === 'quizzes' && window.AcademyQuizAdmin) return window.AcademyQuizAdmin.renderList();
    if (page === 'quiz-builder' && window.AcademyQuizAdmin) return window.AcademyQuizAdmin.renderBuilder();
    if (page === 'dashboard') return renderDashboard();
    if (page === 'live') return renderLive();
    if (page === 'reports') return renderReports();
    if (page === 'settings') return renderSettings();
    if (page === 'calendar') return renderCalendar();
    if (page === 'certificates') return renderCertificatesPage();
    return renderGeneric(page);
  }

  document.addEventListener('DOMContentLoaded', init);
  return { api };
})();
