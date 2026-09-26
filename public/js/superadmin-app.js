const SA = (() => {
  let user = null;

  try {
    user = JSON.parse(localStorage.getItem('af_user') || 'null');
  } catch {}

  if (!user || user.role !== 'superadmin') {
    location.href = '/owner/login.html';
    return {};
  }

  const page = document.body.dataset.page || 'dashboard';
  let plansCache = null;
  let toastTimer = null;

  const meta = {
    dashboard: ['لوحة مالك النظام','ملخص حي للأكاديميات والاشتراكات وحالة المنصة.'],
    academies: ['الأكاديميات','إدارة حسابات الأكاديميات وحالتها وبياناتها.'],
    plans: ['الباقات','إنشاء الباقات وتعديل الأسعار والحدود والمميزات.'],
    subscriptions: ['الاشتراكات','تعيين الباقات وتمديد الاشتراكات ومتابعة تواريخ الانتهاء.'],
    health: ['صحة النظام','فحص فعلي لاتصال قاعدة البيانات والسيرفر والإعدادات الأساسية.'],
    audit: ['سجل العمليات','سجل إجراءات مالك النظام على الأكاديميات والباقات والإعدادات.'],
    settings: ['إعدادات المنصة','إعدادات التجربة والسماح والدعم والهوية العامة للمنصة.']
  };

  const nav = [
    ['dashboard','نظرة عامة','⌂'],
    ['academies','الأكاديميات','A'],
    ['plans','الباقات','P'],
    ['subscriptions','الاشتراكات','S'],
    ['health','صحة النظام','H'],
    ['audit','سجل العمليات','L'],
    ['settings','الإعدادات','⚙']
  ];

  const statusLabels = {
    trial: 'تجريبية',
    active: 'نشطة',
    grace: 'فترة سماح',
    frozen: 'موقوفة',
    suspended: 'معلقة'
  };

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#039;');
  }

  function fmtDate(value, withTime = false) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';

    return withTime
      ? d.toLocaleString('ar-OM',{dateStyle:'medium',timeStyle:'short'})
      : d.toLocaleDateString('ar-OM',{dateStyle:'medium'});
  }

  function fmtMoney(value) {
    return new Intl.NumberFormat('en-OM',{
      style:'currency',
      currency:'OMR',
      maximumFractionDigits:3
    }).format(Number(value || 0));
  }

  function statusBadge(value) {
    const good = ['active'];
    const warn = ['trial','grace'];
    const bad = ['frozen','suspended'];
    const cls = good.includes(value) ? 'good' : warn.includes(value) ? 'warn' : bad.includes(value) ? 'bad' : 'info';
    return '<span class="sa-status '+cls+'">'+esc(statusLabels[value] || value || '—')+'</span>';
  }

  function yesNo(value) {
    return value
      ? '<span class="sa-status good">مضبوط</span>'
      : '<span class="sa-status bad">غير مضبوط</span>';
  }

  async function api(url, options = {}) {
    const response = await fetch(url,{
      ...options,
      credentials:'same-origin',
      headers:{
        ...(options.body ? {'Content-Type':'application/json'} : {}),
        ...(options.headers || {})
      }
    });

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('af_token');
      localStorage.removeItem('af_user');
      location.href = '/owner/login.html';
      throw new Error('انتهت الجلسة');
    }

    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    if (!response.ok) {
      throw new Error(data?.message || 'تعذر تنفيذ العملية');
    }

    return data;
  }

  function toast(message, type = 'ok') {
    const box = document.getElementById('saToast');
    if (!box) return;

    box.textContent = message;
    box.style.borderColor = type === 'error' ? 'color-mix(in srgb,var(--danger) 35%,var(--line))' : 'var(--line)';
    box.classList.add('show');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove('show'), 2800);
  }

  function href(name) {
    return '/superadmin/'+name+'.html';
  }

  function renderShell() {
    const root = document.getElementById('superAdminApp');
    const current = meta[page] || ['AcademyFlow',''];

    root.innerHTML = `
      <div class="sa-layout">
        <aside class="sa-sidebar" id="saSidebar">
          <a class="brand" href="/superadmin/dashboard.html">
            <span class="brand-badge">AF</span>
            <span class="brand-text"><b>AcademyFlow</b><small>OWNER CONTROL</small></span>
          </a>

          <div class="sa-nav-title">إدارة المنصة</div>
          <nav class="sa-nav">
            ${nav.map(x => '<a class="'+(x[0] === page ? 'active' : '')+'" href="'+href(x[0])+'"><span class="sa-nav-icon">'+esc(x[2])+'</span>'+esc(x[1])+'</a>').join('')}
          </nav>

          <div class="sa-sidebar-foot">
            <b style="display:block;color:var(--text);margin-bottom:3px">${esc(user.name || 'مالك النظام')}</b>
            Super Admin<br>
            <span>وصول مركزي لجميع الأكاديميات.</span>
          </div>
        </aside>

        <div class="sa-overlay" id="saOverlay"></div>

        <main class="sa-main">
          <div class="sa-content">
            <header class="sa-topbar">
              <div style="display:flex;align-items:flex-start;gap:9px;min-width:0">
                <button class="sa-menu-btn" id="saMenuButton" type="button" aria-label="فتح القائمة">☰</button>
                <div class="sa-heading">
                  <span class="sa-eyebrow">OWNER CONTROL CENTER</span>
                  <h1>${esc(current[0])}</h1>
                  <p>${esc(current[1])}</p>
                </div>
              </div>

              <div class="sa-top-actions">
                <button class="theme-toggle" type="button" onclick="toggleTheme()" title="فاتح / داكن">◐</button>
                <div class="sa-user">
                  <span class="sa-avatar">${esc((user.name || 'AF').slice(0,2).toUpperCase())}</span>
                  <span><b>${esc(user.name || 'مالك النظام')}</b><span>${esc(user.username || 'superadmin')}</span></span>
                </div>
                <button class="btn ghost" id="saLogout" type="button">خروج ↗</button>
              </div>
            </header>

            <section id="saPageContent"></section>
            <div class="sa-footer">AcademyFlow · Owner Control Center</div>
          </div>
        </main>
      </div>

      <section class="sa-modal" id="saModal" hidden>
        <div class="sa-modal-card">
          <div class="sa-modal-head">
            <div>
              <h2 id="saModalTitle">إجراء</h2>
              <p id="saModalSubtitle"></p>
            </div>
            <button class="icon-btn" id="saModalClose" type="button">×</button>
          </div>
          <form id="saModalForm" class="sa-form-grid"></form>
        </div>
      </section>

      <div class="sa-toast" id="saToast"></div>
    `;

    const sidebar = document.getElementById('saSidebar');
    const overlay = document.getElementById('saOverlay');

    function closeMenu() {
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
    }

    document.getElementById('saMenuButton').onclick = () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('show');
    };

    overlay.onclick = closeMenu;
    document.querySelectorAll('.sa-nav a').forEach(a => a.addEventListener('click',closeMenu));

    document.getElementById('saLogout').onclick = async () => {
      try {
        await fetch('/api/auth/logout', { method:'POST', credentials:'same-origin' });
      } catch {}
      localStorage.removeItem('af_token');
      localStorage.removeItem('af_user');
      location.replace('/owner/login.html');
    };

    const modal = document.getElementById('saModal');
    document.getElementById('saModalClose').onclick = () => modal.hidden = true;
    modal.addEventListener('click',e => {
      if (e.target === modal) modal.hidden = true;
    });

    document.addEventListener('keydown',e => {
      if (e.key === 'Escape') {
        modal.hidden = true;
        closeMenu();
      }
    });
  }

  function kpi(label,value,icon) {
    return `
      <article class="sa-kpi">
        <div class="sa-kpi-top"><small>${esc(label)}</small><span class="sa-kpi-icon">${esc(icon)}</span></div>
        <strong>${esc(value ?? 0)}</strong>
      </article>
    `;
  }

  async function getPlans(force = false) {
    if (!plansCache || force) {
      plansCache = await api('/api/superadmin/plans?all=1');
    }
    return plansCache;
  }

  async function openModal({title,subtitle='',fields=[],values={},submitLabel='حفظ',onSubmit}) {
    const modal = document.getElementById('saModal');
    const form = document.getElementById('saModalForm');
    document.getElementById('saModalTitle').textContent = title;
    document.getElementById('saModalSubtitle').textContent = subtitle;

    const html = [];
    for (const f of fields) {
      const [name,label,type,required,options,full] = f;
      const req = required ? 'required' : '';
      const cls = full ? 'field full' : 'field';
      const value = values[name] ?? '';

      if (type === 'textarea') {
        html.push('<div class="'+cls+'"><label>'+esc(label)+'</label><textarea name="'+esc(name)+'" '+req+'>'+esc(value)+'</textarea></div>');
      } else if (type === 'select') {
        html.push('<div class="'+cls+'"><label>'+esc(label)+'</label><select name="'+esc(name)+'" '+req+'>'+
          (required ? '' : '<option value="">بدون</option>')+
          (options || []).map(o => '<option value="'+esc(o[0])+'" '+(String(o[0]) === String(value) ? 'selected' : '')+'>'+esc(o[1])+'</option>').join('')+
          '</select></div>');
      } else if (type === 'checkbox') {
        html.push('<div class="full sa-switch-row"><span><b>'+esc(label)+'</b><span>'+esc(options || '')+'</span></span><label class="sa-switch"><input name="'+esc(name)+'" type="checkbox" '+(value ? 'checked' : '')+'><i></i></label></div>');
      } else {
        html.push('<div class="'+cls+'"><label>'+esc(label)+'</label><input name="'+esc(name)+'" type="'+esc(type)+'" value="'+esc(value)+'" '+req+'></div>');
      }
    }

    html.push('<div class="sa-form-message" id="saFormMessage"></div>');
    html.push('<div class="sa-form-actions"><button class="btn ghost" id="saModalCancel" type="button">إلغاء</button><button class="btn primary" type="submit">'+esc(submitLabel)+'</button></div>');
    form.innerHTML = html.join('');

    modal.hidden = false;
    document.getElementById('saModalCancel').onclick = () => modal.hidden = true;

    form.onsubmit = async e => {
      e.preventDefault();

      const submit = form.querySelector('button[type="submit"]');
      const original = submit.textContent;
      const message = document.getElementById('saFormMessage');
      submit.disabled = true;
      submit.textContent = 'جاري الحفظ...';
      message.textContent = '';

      const fd = new FormData(form);
      const data = Object.fromEntries(fd.entries());

      fields.filter(f => f[2] === 'checkbox').forEach(f => {
        data[f[0]] = form.elements[f[0]].checked;
      });

      for (const key of Object.keys(data)) {
        if (data[key] === '') delete data[key];
      }

      try {
        await onSubmit(data);
        modal.hidden = true;
      } catch (err) {
        message.textContent = err.message;
      } finally {
        submit.disabled = false;
        submit.textContent = original;
      }
    };
  }

  async function academyFields() {
    const plans = await getPlans();
    return [
      ['name','اسم الأكاديمية','text',true],
      ['nameEn','الاسم بالإنجليزية','text',false],
      ['slug','الرابط المختصر','text',true],
      ['ownerName','اسم المالك','text',true],
      ['ownerEmail','بريد المالك','email',true],
      ['ownerPhone','رقم المالك','text',false],
      ['ownerPassword','كلمة مرور المالك','password',true],
      ['planId','الباقة','select',false,plans.map(x => [x._id,x.name+' · '+x.code])],
      ['city','المدينة','text',false],
      ['country','الدولة','text',false],
      ['phone','هاتف الأكاديمية','text',false],
      ['email','بريد الأكاديمية','email',false]
    ];
  }

  async function openCreateAcademy(onDone) {
    await openModal({
      title:'إنشاء أكاديمية',
      subtitle:'ينشئ مساحة مستقلة + كود دخول + حساب مالك مشفر.',
      fields:await academyFields(),
      submitLabel:'إنشاء الأكاديمية',
      onSubmit:async data => {
        await api('/api/superadmin/academies',{method:'POST',body:JSON.stringify(data)});
        toast('تم إنشاء الأكاديمية بنجاح');
        await onDone();
      }
    });
  }

  async function openEditAcademy(row,onDone) {
    const plans = await getPlans();

    await openModal({
      title:'تعديل الأكاديمية',
      subtitle:row.name+' · '+row.code,
      values:{
        name:row.name || '',
        nameEn:row.nameEn || '',
        phone:row.phone || '',
        email:row.email || '',
        country:row.country || '',
        city:row.city || '',
        currency:row.currency || 'OMR',
        timezone:row.timezone || 'Asia/Muscat',
        planId:row.planId?._id || row.planId || ''
      },
      fields:[
        ['name','اسم الأكاديمية','text',true],
        ['nameEn','الاسم بالإنجليزية','text',false],
        ['planId','الباقة','select',false,plans.map(x => [x._id,x.name+' · '+x.code])],
        ['phone','رقم الهاتف','text',false],
        ['email','البريد','email',false],
        ['city','المدينة','text',false],
        ['country','الدولة','text',false],
        ['currency','العملة','text',false],
        ['timezone','المنطقة الزمنية','text',false]
      ],
      onSubmit:async data => {
        await api('/api/superadmin/academies/'+row._id,{method:'PATCH',body:JSON.stringify(data)});
        toast('تم تحديث بيانات الأكاديمية');
        await onDone();
      }
    });
  }

  async function openStatusAcademy(row,onDone) {
    await openModal({
      title:'تغيير حالة الأكاديمية',
      subtitle:row.name+' · '+row.code,
      values:{status:row.status},
      fields:[
        ['status','الحالة','select',true,[
          ['trial','تجريبية'],['active','نشطة'],['grace','فترة سماح'],
          ['frozen','موقوفة'],['suspended','معلقة']
        ]]
      ],
      submitLabel:'تحديث الحالة',
      onSubmit:async data => {
        await api('/api/superadmin/academies/'+row._id+'/status',{method:'PATCH',body:JSON.stringify(data)});
        toast('تم تحديث حالة الأكاديمية');
        await onDone();
      }
    });
  }

  async function openSubscription(row,onDone) {
    const plans = await getPlans();

    await openModal({
      title:'إدارة الاشتراك',
      subtitle:row.name+' · '+row.code,
      values:{
        planId:row.planId?._id || '',
        subscriptionEndsAt:row.subscriptionEndsAt ? new Date(row.subscriptionEndsAt).toISOString().slice(0,10) : '',
        status:row.status
      },
      fields:[
        ['planId','الباقة','select',false,plans.map(x => [x._id,x.name+' · '+x.code])],
        ['subscriptionEndsAt','تاريخ انتهاء الاشتراك','date',false],
        ['status','الحالة بعد الحفظ','select',true,[
          ['trial','تجريبية'],['active','نشطة'],['grace','فترة سماح'],
          ['frozen','موقوفة'],['suspended','معلقة']
        ]]
      ],
      submitLabel:'حفظ الاشتراك',
      onSubmit:async data => {
        await api('/api/superadmin/academies/'+row._id+'/subscription',{method:'PATCH',body:JSON.stringify(data)});
        toast('تم تحديث الاشتراك');
        await onDone();
      }
    });
  }

  async function renderDashboard() {
    const target = document.getElementById('saPageContent');
    target.innerHTML = '<div class="sa-empty">جاري تحميل البيانات...</div>';

    try {
      const [stats,academies] = await Promise.all([
        api('/api/superadmin/stats'),
        api('/api/superadmin/academies')
      ]);

      const recent = academies.slice(0,6);

      target.innerHTML = `
        <section class="sa-kpis">
          ${kpi('إجمالي الأكاديميات',stats.total,'A')}
          ${kpi('النشطة',stats.active,'✓')}
          ${kpi('التجريبية',stats.trial,'T')}
          ${kpi('تنتهي خلال 30 يوم',stats.expiringSoon,'!')}
        </section>

        <section class="sa-grid-2">
          <article class="sa-card">
            <div class="sa-card-head">
              <div><h2>إدارة سريعة</h2><p>اختصارات مباشرة لأهم أعمال مالك النظام.</p></div>
            </div>
            <div class="sa-list">
              <div class="sa-list-row"><div><b>إضافة أكاديمية جديدة</b><span>إنشاء كود وحساب مالك وفترة تجربة.</span></div><button class="btn primary" id="dashAddAcademy">إضافة</button></div>
              <div class="sa-list-row"><div><b>إدارة الاشتراكات</b><span>الباقات وتواريخ الانتهاء وحالة الحساب.</span></div><a class="btn soft" href="/superadmin/subscriptions.html">فتح</a></div>
              <div class="sa-list-row"><div><b>صحة النظام</b><span>قاعدة البيانات والسيرفر والإعدادات.</span></div><a class="btn soft" href="/superadmin/health.html">فحص</a></div>
            </div>
          </article>

          <article class="sa-card">
            <div class="sa-card-head"><div><h2>حالة الحسابات</h2><p>توزيع الأكاديميات حسب الحالة.</p></div></div>
            <div class="sa-list">
              <div class="sa-list-row"><div><b>نشطة</b><span>تعمل بشكل طبيعي.</span></div><strong>${esc(stats.active)}</strong></div>
              <div class="sa-list-row"><div><b>فترة سماح</b><span>تحتاج متابعة الاشتراك.</span></div><strong>${esc(stats.grace)}</strong></div>
              <div class="sa-list-row"><div><b>موقوفة / معلقة</b><span>لا يمكنها استخدام المنصة بشكل طبيعي.</span></div><strong>${esc(Number(stats.frozen || 0)+Number(stats.suspended || 0))}</strong></div>
              <div class="sa-list-row"><div><b>الباقات النشطة</b><span>متاحة للتعيين على الأكاديميات.</span></div><strong>${esc(stats.plansCount)}</strong></div>
            </div>
          </article>
        </section>

        <section class="sa-card sa-section">
          <div class="sa-card-head">
            <div><h2>أحدث الأكاديميات</h2><p>آخر الحسابات التي تم إنشاؤها.</p></div>
            <div class="sa-actions">
              <button class="btn secondary" id="dashRefresh">تحديث</button>
              <a class="btn soft" href="/superadmin/academies.html">عرض الكل</a>
            </div>
          </div>
          <div class="sa-table-wrap">
            <table class="sa-table">
              <thead><tr><th>الكود</th><th>الأكاديمية</th><th>الباقة</th><th>الحالة</th><th>تاريخ الإنشاء</th></tr></thead>
              <tbody>
                ${recent.length ? recent.map(x => `
                  <tr>
                    <td><b>${esc(x.code)}</b></td>
                    <td class="sa-row-title"><b>${esc(x.name)}</b><small>${esc(x.city || 'بدون مدينة')}</small></td>
                    <td>${esc(x.planId?.name || 'بدون باقة')}</td>
                    <td>${statusBadge(x.status)}</td>
                    <td>${fmtDate(x.createdAt)}</td>
                  </tr>
                `).join('') : '<tr><td colspan="5" class="sa-empty">لا توجد أكاديميات حتى الآن.</td></tr>'}
              </tbody>
            </table>
          </div>
        </section>
      `;

      document.getElementById('dashAddAcademy').onclick = () => openCreateAcademy(renderDashboard);
      document.getElementById('dashRefresh').onclick = renderDashboard;
    } catch (err) {
      target.innerHTML = '<div class="sa-card sa-empty">'+esc(err.message)+'</div>';
    }
  }

  async function renderAcademies() {
    const target = document.getElementById('saPageContent');
    target.innerHTML = `
      <section class="sa-card">
        <div class="sa-card-head">
          <div><h2>جميع الأكاديميات</h2><p>تعديل البيانات والحالة والاشتراك من نفس الصفحة.</p></div>
          <div class="sa-actions">
            <input class="sa-search" id="academySearch" placeholder="بحث بالاسم أو الكود...">
            <button class="btn secondary" id="academiesRefresh">تحديث</button>
            <button class="btn primary" id="academiesAdd">+ أكاديمية</button>
          </div>
        </div>
        <div id="academiesRows"><div class="sa-empty">جاري التحميل...</div></div>
      </section>
    `;

    let rows = [];

    const draw = () => {
      const q = (document.getElementById('academySearch').value || '').trim().toLowerCase();
      const filtered = q ? rows.filter(x => JSON.stringify(x).toLowerCase().includes(q)) : rows;

      document.getElementById('academiesRows').innerHTML = `
        <div class="sa-table-wrap">
          <table class="sa-table">
            <thead><tr><th>الكود</th><th>الأكاديمية</th><th>الباقة</th><th>الحالة</th><th>التجربة</th><th>الاشتراك</th><th>إجراءات</th></tr></thead>
            <tbody>
              ${filtered.length ? filtered.map((x,i) => `
                <tr>
                  <td><b>${esc(x.code)}</b></td>
                  <td class="sa-row-title"><b>${esc(x.name)}</b><small>${esc(x.email || x.city || '—')}</small></td>
                  <td>${esc(x.planId?.name || 'بدون باقة')}</td>
                  <td>${statusBadge(x.status)}</td>
                  <td>${fmtDate(x.trialEndsAt)}</td>
                  <td>${fmtDate(x.subscriptionEndsAt)}</td>
                  <td>
                    <div class="sa-actions">
                      <button class="btn soft sa-edit-academy" data-index="${i}" type="button">تعديل</button>
                      <button class="btn secondary sa-status-academy" data-index="${i}" type="button">الحالة</button>
                      <button class="btn ghost sa-sub-academy" data-index="${i}" type="button">الاشتراك</button>
                    </div>
                  </td>
                </tr>
              `).join('') : '<tr><td colspan="7" class="sa-empty">لا توجد نتائج.</td></tr>'}
            </tbody>
          </table>
        </div>
      `;

      document.querySelectorAll('.sa-edit-academy').forEach(btn => {
        btn.onclick = () => openEditAcademy(filtered[Number(btn.dataset.index)],load);
      });
      document.querySelectorAll('.sa-status-academy').forEach(btn => {
        btn.onclick = () => openStatusAcademy(filtered[Number(btn.dataset.index)],load);
      });
      document.querySelectorAll('.sa-sub-academy').forEach(btn => {
        btn.onclick = () => openSubscription(filtered[Number(btn.dataset.index)],load);
      });
    };

    const load = async () => {
      try {
        rows = await api('/api/superadmin/academies');
        draw();
      } catch (err) {
        document.getElementById('academiesRows').innerHTML = '<div class="sa-empty">'+esc(err.message)+'</div>';
      }
    };

    document.getElementById('academySearch').oninput = draw;
    document.getElementById('academiesRefresh').onclick = load;
    document.getElementById('academiesAdd').onclick = () => openCreateAcademy(load);
    await load();
  }

  async function openPlanForm(row,onDone) {
    await openModal({
      title:row ? 'تعديل الباقة' : 'إنشاء باقة',
      subtitle:row ? row.name+' · '+row.code : 'حدد السعر والحدود والمميزات.',
      values:row ? {
        name:row.name,
        code:row.code,
        monthlyPrice:row.monthlyPrice,
        yearlyPrice:row.yearlyPrice,
        students:row.limits?.students,
        instructors:row.limits?.instructors,
        courses:row.limits?.courses,
        branches:row.limits?.branches,
        features:(row.features || []).join('\n')
      } : {},
      fields:[
        ['name','اسم الباقة','text',true],
        ...(!row ? [['code','كود الباقة','text',true]] : []),
        ['monthlyPrice','السعر الشهري','number',false],
        ['yearlyPrice','السعر السنوي','number',false],
        ['students','حد الطلاب','number',true],
        ['instructors','حد المدربين','number',true],
        ['courses','حد الدورات','number',true],
        ['branches','حد الفروع','number',true],
        ['features','المميزات — ميزة بكل سطر','textarea',false,null,true]
      ],
      submitLabel:row ? 'حفظ التعديلات' : 'إنشاء الباقة',
      onSubmit:async data => {
        if (row) {
          await api('/api/superadmin/plans/'+row._id,{method:'PATCH',body:JSON.stringify(data)});
          toast('تم تعديل الباقة');
        } else {
          await api('/api/superadmin/plans',{method:'POST',body:JSON.stringify(data)});
          toast('تم إنشاء الباقة');
        }
        plansCache = null;
        await onDone();
      }
    });
  }

  async function renderPlans() {
    const target = document.getElementById('saPageContent');
    target.innerHTML = `
      <section class="sa-card">
        <div class="sa-card-head">
          <div><h2>باقات AcademyFlow</h2><p>الباقات الحقيقية التي يمكن تعيينها على الأكاديميات.</p></div>
          <div class="sa-actions">
            <button class="btn secondary" id="plansRefresh">تحديث</button>
            <button class="btn primary" id="plansAdd">+ باقة</button>
          </div>
        </div>
        <div id="plansRows"><div class="sa-empty">جاري التحميل...</div></div>
      </section>
    `;

    const load = async () => {
      try {
        const rows = await getPlans(true);
        document.getElementById('plansRows').innerHTML = rows.length ? '<div class="sa-plan-grid">'+rows.map((x,i) => `
          <article class="sa-plan">
            <div class="sa-plan-head">
              <div><h3>${esc(x.name)}</h3><span class="sa-plan-code">${esc(x.code)}</span></div>
              ${x.active ? '<span class="sa-status good">نشطة</span>' : '<span class="sa-status bad">معطلة</span>'}
            </div>
            <div class="sa-plan-price">${fmtMoney(x.monthlyPrice)} <small>/ شهر</small></div>
            <div class="sa-plan-limits">
              <span>الطلاب: ${esc(x.limits?.students ?? 0)}</span>
              <span>المدربين: ${esc(x.limits?.instructors ?? 0)}</span>
              <span>الدورات: ${esc(x.limits?.courses ?? 0)}</span>
              <span>الفروع: ${esc(x.limits?.branches ?? 0)}</span>
            </div>
            <ul class="sa-plan-features">
              ${(x.features || []).slice(0,6).map(f => '<li>'+esc(f)+'</li>').join('') || '<li>لا توجد مميزات مضافة</li>'}
            </ul>
            <div class="sa-actions" style="margin-top:13px">
              <button class="btn soft sa-plan-edit" data-index="${i}" type="button">تعديل</button>
              <button class="btn ${x.active ? 'ghost' : 'secondary'} sa-plan-toggle" data-index="${i}" type="button">${x.active ? 'تعطيل' : 'تفعيل'}</button>
            </div>
          </article>
        `).join('')+'</div>' : '<div class="sa-empty">لا توجد باقات. أنشئ أول باقة الآن.</div>';

        document.querySelectorAll('.sa-plan-edit').forEach(btn => {
          btn.onclick = () => openPlanForm(rows[Number(btn.dataset.index)],load);
        });

        document.querySelectorAll('.sa-plan-toggle').forEach(btn => {
          btn.onclick = async () => {
            const row = rows[Number(btn.dataset.index)];
            try {
              await api('/api/superadmin/plans/'+row._id+'/toggle',{method:'PATCH'});
              toast(row.active ? 'تم تعطيل الباقة' : 'تم تفعيل الباقة');
              plansCache = null;
              await load();
            } catch (err) {
              toast(err.message,'error');
            }
          };
        });
      } catch (err) {
        document.getElementById('plansRows').innerHTML = '<div class="sa-empty">'+esc(err.message)+'</div>';
      }
    };

    document.getElementById('plansRefresh').onclick = load;
    document.getElementById('plansAdd').onclick = () => openPlanForm(null,load);
    await load();
  }

  async function renderSubscriptions() {
    const target = document.getElementById('saPageContent');
    target.innerHTML = `
      <section class="sa-card">
        <div class="sa-card-head">
          <div><h2>اشتراكات الأكاديميات</h2><p>تعيين الباقة وتاريخ الانتهاء والحالة من مكان واحد.</p></div>
          <div class="sa-actions">
            <input class="sa-search" id="subscriptionSearch" placeholder="بحث بالأكاديمية...">
            <button class="btn secondary" id="subscriptionsRefresh">تحديث</button>
          </div>
        </div>
        <div id="subscriptionsRows"><div class="sa-empty">جاري التحميل...</div></div>
      </section>
    `;

    let rows = [];

    const draw = () => {
      const q = (document.getElementById('subscriptionSearch').value || '').trim().toLowerCase();
      const filtered = q ? rows.filter(x => JSON.stringify(x).toLowerCase().includes(q)) : rows;

      document.getElementById('subscriptionsRows').innerHTML = `
        <div class="sa-table-wrap">
          <table class="sa-table">
            <thead><tr><th>الأكاديمية</th><th>الباقة</th><th>الحالة</th><th>التجربة</th><th>السماح</th><th>نهاية الاشتراك</th><th>إجراء</th></tr></thead>
            <tbody>
              ${filtered.length ? filtered.map((x,i) => `
                <tr>
                  <td class="sa-row-title"><b>${esc(x.name)}</b><small>${esc(x.code)}</small></td>
                  <td>${esc(x.planId?.name || 'بدون باقة')}</td>
                  <td>${statusBadge(x.status)}</td>
                  <td>${fmtDate(x.trialEndsAt)}</td>
                  <td>${fmtDate(x.graceEndsAt)}</td>
                  <td>${fmtDate(x.subscriptionEndsAt)}</td>
                  <td><button class="btn primary sa-manage-sub" data-index="${i}" type="button">إدارة</button></td>
                </tr>
              `).join('') : '<tr><td colspan="7" class="sa-empty">لا توجد نتائج.</td></tr>'}
            </tbody>
          </table>
        </div>
      `;

      document.querySelectorAll('.sa-manage-sub').forEach(btn => {
        btn.onclick = () => openSubscription(filtered[Number(btn.dataset.index)],load);
      });
    };

    const load = async () => {
      try {
        rows = await api('/api/superadmin/subscriptions');
        draw();
      } catch (err) {
        document.getElementById('subscriptionsRows').innerHTML = '<div class="sa-empty">'+esc(err.message)+'</div>';
      }
    };

    document.getElementById('subscriptionSearch').oninput = draw;
    document.getElementById('subscriptionsRefresh').onclick = load;
    await load();
  }

  function uptime(seconds) {
    seconds = Number(seconds || 0);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return (days ? days+' يوم ' : '')+(hours ? hours+' س ' : '')+minutes+' د';
  }

  async function renderHealth() {
    const target = document.getElementById('saPageContent');
    target.innerHTML = `
      <section class="sa-card">
        <div class="sa-card-head">
          <div><h2>فحص المنصة</h2><p>بيانات حقيقية من السيرفر الحالي وليست مؤشرات شكلية.</p></div>
          <button class="btn primary" id="healthRefresh">فحص الآن</button>
        </div>
        <div id="healthRows"><div class="sa-empty">جاري الفحص...</div></div>
      </section>
    `;

    const load = async () => {
      document.getElementById('healthRows').innerHTML = '<div class="sa-empty">جاري الفحص...</div>';
      try {
        const h = await api('/api/superadmin/health');

        document.getElementById('healthRows').innerHTML = `
          <div class="sa-health-grid">
            <article class="sa-health-item"><small>MongoDB</small><strong>${esc(h.database.state)}</strong><p>${esc(h.database.name || 'Database')}</p></article>
            <article class="sa-health-item"><small>مدة تشغيل السيرفر</small><strong>${esc(uptime(h.server.uptimeSeconds))}</strong><p>${esc(h.server.node)}</p></article>
            <article class="sa-health-item"><small>الذاكرة المستخدمة</small><strong>${esc(h.server.memoryMb.rss)} MB</strong><p>Heap: ${esc(h.server.memoryMb.heapUsed)} / ${esc(h.server.memoryMb.heapTotal)} MB</p></article>
            <article class="sa-health-item"><small>الأكاديميات</small><strong>${esc(h.counts.academies)}</strong><p>إجمالي الحسابات</p></article>
            <article class="sa-health-item"><small>المستخدمين</small><strong>${esc(h.counts.users)}</strong><p>جميع أدوار النظام</p></article>
            <article class="sa-health-item"><small>سجل العمليات</small><strong>${esc(h.counts.auditLogs)}</strong><p>إجراءات موثقة</p></article>
          </div>

          <div class="sa-grid-2 sa-section">
            <article class="sa-card" style="box-shadow:none">
              <div class="sa-card-head"><div><h2>الإعدادات الحساسة</h2><p>يظهر فقط هل المتغير مضبوط أم لا، بدون كشف القيم.</p></div></div>
              <div class="sa-config-list">
                <div class="sa-config-row"><b>JWT_SECRET</b>${yesNo(h.configuration.jwtConfigured)}</div>
                <div class="sa-config-row"><b>MONGODB_URI</b>${yesNo(h.configuration.mongoConfigured)}</div>
                <div class="sa-config-row"><b>ALLOWED_ORIGINS</b>${yesNo(h.configuration.allowedOriginsConfigured)}</div>
                <div class="sa-config-row"><b>Super Admin</b>${yesNo(h.configuration.superAdminConfigured)}</div>
                <div class="sa-config-row"><b>Zoom Server-to-Server</b>${yesNo(h.configuration.zoomConfigured)}</div>
              </div>
            </article>

            <article class="sa-card" style="box-shadow:none">
              <div class="sa-card-head"><div><h2>نتيجة الفحص</h2><p>آخر فحص: ${fmtDate(h.checkedAt,true)}</p></div></div>
              <div class="sa-note ${h.ok ? '' : 'sa-danger-note'}">
                ${h.ok
                  ? 'قاعدة البيانات متصلة والسيرفر استجاب لفحص الصحة بنجاح.'
                  : 'يوجد خلل في اتصال قاعدة البيانات. راجع Railway Logs وMongoDB Atlas.'}
              </div>
            </article>
          </div>
        `;
        toast('تم تحديث فحص النظام');
      } catch (err) {
        document.getElementById('healthRows').innerHTML = '<div class="sa-empty">'+esc(err.message)+'</div>';
      }
    };

    document.getElementById('healthRefresh').onclick = load;
    await load();
  }

  async function renderAudit() {
    const target = document.getElementById('saPageContent');
    target.innerHTML = `
      <section class="sa-card">
        <div class="sa-card-head">
          <div><h2>سجل العمليات</h2><p>آخر 200 إجراء مسجل لمالك النظام.</p></div>
          <div class="sa-actions">
            <input class="sa-search" id="auditSearch" placeholder="بحث بالإجراء أو الهدف...">
            <button class="btn secondary" id="auditRefresh">تحديث</button>
          </div>
        </div>
        <div id="auditRows"><div class="sa-empty">جاري التحميل...</div></div>
      </section>
    `;

    let rows = [];

    const draw = () => {
      const q = (document.getElementById('auditSearch').value || '').trim().toLowerCase();
      const filtered = q ? rows.filter(x => JSON.stringify(x).toLowerCase().includes(q)) : rows;

      document.getElementById('auditRows').innerHTML = `
        <div class="sa-table-wrap">
          <table class="sa-table">
            <thead><tr><th>الوقت</th><th>الإجراء</th><th>الهدف</th><th>المنفذ</th><th>التفاصيل</th></tr></thead>
            <tbody>
              ${filtered.length ? filtered.map(x => `
                <tr>
                  <td>${fmtDate(x.createdAt,true)}</td>
                  <td><span class="sa-audit-action">${esc(x.action)}</span></td>
                  <td class="sa-row-title"><b>${esc(x.targetLabel || x.targetType)}</b><small>${esc(x.targetType)}</small></td>
                  <td>${esc(x.actorId?.username || x.actorId?.name || 'Super Admin')}</td>
                  <td><small>${esc(Object.keys(x.details || {}).join('، ') || '—')}</small></td>
                </tr>
              `).join('') : '<tr><td colspan="5" class="sa-empty">لا يوجد سجل بعد. العمليات الجديدة ستظهر هنا.</td></tr>'}
            </tbody>
          </table>
        </div>
      `;
    };

    const load = async () => {
      try {
        rows = await api('/api/superadmin/audit?limit=200');
        draw();
      } catch (err) {
        document.getElementById('auditRows').innerHTML = '<div class="sa-empty">'+esc(err.message)+'</div>';
      }
    };

    document.getElementById('auditSearch').oninput = draw;
    document.getElementById('auditRefresh').onclick = load;
    await load();
  }

  async function renderSettings() {
    const target = document.getElementById('saPageContent');
    target.innerHTML = '<div class="sa-empty">جاري تحميل الإعدادات...</div>';

    try {
      const s = await api('/api/superadmin/settings');

      target.innerHTML = `
        <form id="saSettingsForm">
          <div class="sa-settings-grid">
            <section class="sa-settings-block">
              <h3>الإعدادات العامة</h3>
              <div class="field"><label>اسم المنصة</label><input name="platformName" value="${esc(s.platformName || 'AcademyFlow')}"></div>
              <div class="field"><label>العملة الافتراضية</label><input name="defaultCurrency" value="${esc(s.defaultCurrency || 'OMR')}"></div>
              <div class="field"><label>مدة التجربة الافتراضية بالأيام</label><input name="defaultTrialDays" type="number" min="0" max="365" value="${esc(s.defaultTrialDays ?? 15)}"></div>
              <div class="field"><label>فترة السماح بالأيام</label><input name="defaultGraceDays" type="number" min="0" max="90" value="${esc(s.defaultGraceDays ?? 5)}"></div>
            </section>

            <section class="sa-settings-block">
              <h3>الدعم والتنبيهات</h3>
              <div class="field"><label>بريد الدعم</label><input name="supportEmail" type="email" value="${esc(s.supportEmail || '')}"></div>
              <div class="field"><label>رقم الدعم</label><input name="supportPhone" value="${esc(s.supportPhone || '')}"></div>
              <div class="field"><label>إعلان عام</label><textarea name="announcement">${esc(s.announcement || '')}</textarea></div>
              <div class="sa-switch-row">
                <span><b>وضع الصيانة</b><span>يحفظ حالة الصيانة في إعدادات المنصة لاستخدامها عند ربط بوابة الصيانة.</span></span>
                <label class="sa-switch"><input name="maintenanceMode" type="checkbox" ${s.maintenanceMode ? 'checked' : ''}><i></i></label>
              </div>
            </section>
          </div>

          <div class="sa-card sa-section">
            <div class="sa-card-head">
              <div><h2>حفظ التغييرات</h2><p>التجربة وفترة السماح الجديدة تطبق على الأكاديميات التي يتم إنشاؤها بعد الحفظ.</p></div>
              <button class="btn primary" type="submit">حفظ الإعدادات</button>
            </div>
            <div id="settingsMessage" class="sa-note">آخر تحديث: ${fmtDate(s.updatedAt,true)}</div>
          </div>
        </form>
      `;

      document.getElementById('saSettingsForm').onsubmit = async e => {
        e.preventDefault();
        const form = e.currentTarget;
        const button = form.querySelector('button[type="submit"]');
        const original = button.textContent;
        button.disabled = true;
        button.textContent = 'جاري الحفظ...';

        const data = Object.fromEntries(new FormData(form).entries());
        data.maintenanceMode = form.elements.maintenanceMode.checked;

        try {
          const saved = await api('/api/superadmin/settings',{method:'PATCH',body:JSON.stringify(data)});
          document.getElementById('settingsMessage').textContent = 'تم الحفظ بنجاح · '+fmtDate(saved.updatedAt,true);
          toast('تم حفظ إعدادات المنصة');
        } catch (err) {
          toast(err.message,'error');
        } finally {
          button.disabled = false;
          button.textContent = original;
        }
      };
    } catch (err) {
      target.innerHTML = '<div class="sa-card sa-empty">'+esc(err.message)+'</div>';
    }
  }

  async function init() {
    renderShell();

    if (page === 'dashboard') return renderDashboard();
    if (page === 'academies') return renderAcademies();
    if (page === 'plans') return renderPlans();
    if (page === 'subscriptions') return renderSubscriptions();
    if (page === 'health') return renderHealth();
    if (page === 'audit') return renderAudit();
    if (page === 'settings') return renderSettings();

    document.getElementById('saPageContent').innerHTML = '<div class="sa-card sa-empty">الصفحة غير موجودة.</div>';
  }

  document.addEventListener('DOMContentLoaded',init);
  return { api };
})();