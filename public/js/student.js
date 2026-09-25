const StudentPortal = (() => {
  const token = localStorage.getItem('af_token');
  let user = null;

  try {
    user = JSON.parse(localStorage.getItem('af_user') || 'null');
  } catch {}

  if (!token || !user || user.role !== 'student') {
    location.href = '/academy/login.html';
    return {};
  }

  const page = document.body.dataset.page || 'dashboard';
  const meta = {
    dashboard: ['الرئيسية','تابع تقدمك ودروسك ومحاضراتك القادمة.'],
    courses: ['دوراتي','جميع الدورات المسجل فيها حسابك.'],
    course: ['الدورة','شاهد الدروس وتابع نسبة الإنجاز.'],
    live: ['المحاضرات المباشرة','جلسات Zoom المرتبطة بدوراتك.'],
    assessments: ['الاختبارات','الاختبارات المنشورة في دوراتك.'],
    assignments: ['الواجبات','تابع الواجبات وأرسل إجاباتك.'],
    payments: ['المدفوعات','سجل الدفعات والحالة المالية لحسابك.'],
    certificates: ['الشهادات','الشهادات الصادرة لك من الأكاديمية.'],
    notifications: ['الإشعارات','آخر التنبيهات المرسلة لك.'],
    profile: ['حسابي','بيانات حساب الطالب وكلمة المرور.']
  };

  const nav = [
    ['dashboard','الرئيسية','⌂'],
    ['courses','دوراتي','C'],
    ['live','المحاضرات','Z'],
    ['assessments','الاختبارات','Q'],
    ['assignments','الواجبات','A'],
    ['payments','المدفوعات','P'],
    ['certificates','الشهادات','✓'],
    ['notifications','الإشعارات','N'],
    ['profile','حسابي','U']
  ];

  let toastTimer = null;

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
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';

    return withTime
      ? date.toLocaleString('ar-OM',{dateStyle:'medium',timeStyle:'short'})
      : date.toLocaleDateString('ar-OM',{dateStyle:'medium'});
  }

  function fmtMoney(value, currency = 'OMR') {
    return new Intl.NumberFormat('en-OM',{
      style:'currency',
      currency:currency || 'OMR',
      maximumFractionDigits:3
    }).format(Number(value || 0));
  }

  function href(name) {
    return '/student/'+name+'.html';
  }

  function status(value) {
    const labels = {
      active:'نشط',
      paused:'متوقف مؤقتًا',
      completed:'مكتمل',
      scheduled:'مجدولة',
      live:'مباشرة',
      ended:'منتهية',
      published:'منشور',
      closed:'مغلق',
      submitted:'تم التسليم',
      graded:'تم التصحيح',
      paid:'مدفوع',
      pending:'معلق',
      refunded:'مسترجع',
      failed:'فشل'
    };

    const good = ['active','completed','live','graded','paid'];
    const warn = ['paused','scheduled','published','submitted','pending'];
    const bad = ['closed','ended','refunded','failed'];
    const cls = good.includes(value) ? 'good' : warn.includes(value) ? 'warn' : bad.includes(value) ? 'bad' : '';

    return '<span class="student-status '+cls+'">'+esc(labels[value] || value || '—')+'</span>';
  }

  async function api(url, options = {}) {
    const response = await fetch(url,{
      ...options,
      headers:{
        Authorization:'Bearer '+token,
        ...(options.body ? {'Content-Type':'application/json'} : {}),
        ...(options.headers || {})
      }
    });

    if (response.status === 401 || response.status === 403) {
      if (response.status === 401) {
        localStorage.removeItem('af_token');
        localStorage.removeItem('af_user');
        location.href = '/academy/login.html';
      }
    }

    const text = await response.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      throw new Error(data?.message || 'تعذر تنفيذ العملية');
    }

    return data;
  }

  function toast(message, type = 'ok') {
    const box = document.getElementById('studentToast');
    if (!box) return;

    box.textContent = message;
    box.style.borderColor = type === 'error'
      ? 'color-mix(in srgb,var(--danger) 35%,var(--line))'
      : 'var(--line)';
    box.classList.add('show');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove('show'), 2600);
  }

  function renderShell() {
    const root = document.getElementById('studentApp');
    const current = meta[page] || ['بوابة الطالب',''];

    root.innerHTML = `
      <div class="student-layout">
        <aside class="student-sidebar" id="studentSidebar">
          <a class="brand" href="/student/dashboard.html">
            <span class="brand-badge">AF</span>
            <span class="brand-text"><b>AcademyFlow</b><small>STUDENT PORTAL</small></span>
          </a>

          <div class="student-nav-title">مساحة الطالب</div>
          <nav class="student-nav">
            ${nav.map(item => '<a class="'+(item[0] === page || (page === 'course' && item[0] === 'courses') ? 'active' : '')+'" href="'+href(item[0])+'"><span class="student-nav-icon">'+esc(item[2])+'</span>'+esc(item[1])+'</a>').join('')}
          </nav>

          <div class="student-sidebar-card">
            <small>الأكاديمية</small>
            <b>${esc(user.academyName || user.academyCode || 'AcademyFlow')}</b>
          </div>
        </aside>

        <div class="student-overlay" id="studentOverlay"></div>

        <main class="student-main">
          <div class="student-content">
            <header class="student-topbar">
              <div style="display:flex;align-items:flex-start;gap:9px;min-width:0">
                <button class="student-menu-btn" id="studentMenuButton" type="button" aria-label="فتح القائمة">☰</button>
                <div class="student-heading">
                  <span class="student-eyebrow">STUDENT PORTAL</span>
                  <h1>${esc(current[0])}</h1>
                  <p>${esc(current[1])}</p>
                </div>
              </div>

              <div class="student-top-actions">
                <button class="theme-toggle" type="button" onclick="toggleTheme()" title="فاتح / داكن">◐</button>
                <div class="student-user">
                  <span class="student-avatar">${esc((user.name || 'ST').slice(0,2).toUpperCase())}</span>
                  <span><b>${esc(user.name || 'الطالب')}</b><span>${esc(user.academyCode || '')}</span></span>
                </div>
                <button class="btn ghost" id="studentLogout" type="button">خروج ↗</button>
              </div>
            </header>

            <section id="studentPageContent"></section>
            <div class="student-footer">AcademyFlow · Student Learning Portal</div>
          </div>
        </main>
      </div>

      <section class="student-modal" id="studentModal" hidden>
        <div class="student-modal-card">
          <div class="student-modal-head">
            <div>
              <h2 id="studentModalTitle">إجراء</h2>
              <p id="studentModalSubtitle"></p>
            </div>
            <button class="icon-btn" id="studentModalClose" type="button">×</button>
          </div>
          <div id="studentModalBody"></div>
        </div>
      </section>

      <div class="student-toast" id="studentToast"></div>
    `;

    const sidebar = document.getElementById('studentSidebar');
    const overlay = document.getElementById('studentOverlay');

    const closeMenu = () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
    };

    document.getElementById('studentMenuButton').onclick = () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('show');
    };

    overlay.onclick = closeMenu;
    document.querySelectorAll('.student-nav a').forEach(link => link.addEventListener('click',closeMenu));

    document.getElementById('studentLogout').onclick = () => {
      localStorage.removeItem('af_token');
      localStorage.removeItem('af_user');
      location.href = '/academy/login.html';
    };

    const modal = document.getElementById('studentModal');
    document.getElementById('studentModalClose').onclick = () => modal.hidden = true;
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

  function kpi(label,value) {
    return `
      <article class="student-kpi">
        <small>${esc(label)}</small>
        <strong>${esc(value ?? 0)}</strong>
      </article>
    `;
  }

  function courseCard(row) {
    const course = row.course;
    const progress = Number(row.progress || 0);

    return `
      <article class="student-course">
        <div class="student-course-cover">
          ${course.thumbnailUrl
            ? '<img src="'+esc(course.thumbnailUrl)+'" alt="">'
            : esc((course.title || 'C').slice(0,2))}
        </div>

        <div class="student-course-body">
          <h3>${esc(course.title)}</h3>
          <p>${esc(course.description || 'هذه الدورة ضمن مسارك التعليمي في الأكاديمية.')}</p>

          <div class="student-meta">
            <span>${esc(course.category || 'عام')}</span>
            <span>${esc(course.instructor?.name || course.instructor || 'بدون مدرب')}</span>
            ${row.group?.name ? '<span>'+esc(row.group.name)+'</span>' : ''}
          </div>

          <div class="student-progress-line"><i style="width:${Math.max(0,Math.min(100,progress))}%"></i></div>
          <div class="student-progress-caption"><span>التقدم</span><b>${progress}%</b></div>
          <a class="btn primary" href="/student/course.html?id=${encodeURIComponent(course._id || course.id)}">فتح الدورة</a>
        </div>
      </article>
    `;
  }

  async function renderDashboard() {
    const target = document.getElementById('studentPageContent');
    target.innerHTML = '<div class="student-empty">جاري تجهيز صفحتك...</div>';

    try {
      const d = await api('/api/student/dashboard');

      target.innerHTML = `
        <section class="student-kpis">
          ${kpi('دوراتي',d.enrollments)}
          ${kpi('متوسط التقدم',d.averageProgress+'%')}
          ${kpi('محاضرات قادمة',d.upcomingLiveCount)}
          ${kpi('واجبات متاحة',d.pendingAssignments)}
        </section>

        <section class="student-card">
          <div class="student-card-head">
            <div><h2>أكمل التعلم</h2><p>أحدث الدورات المسجل فيها حسابك.</p></div>
            <a class="btn soft" href="/student/courses.html">كل الدورات</a>
          </div>

          ${d.recentCourses?.length
            ? '<div class="student-course-grid">'+d.recentCourses.map(courseCard).join('')+'</div>'
            : '<div class="student-empty">لا توجد دورات مسجلة لحسابك حتى الآن.</div>'}
        </section>

        <section class="student-grid-2 student-section">
          <article class="student-card">
            <div class="student-card-head">
              <div><h2>المحاضرات القادمة</h2><p>أقرب جلسات Zoom في دوراتك.</p></div>
              <a class="btn soft" href="/student/live.html">عرض الكل</a>
            </div>

            <div class="student-list">
              ${d.upcomingLive?.length ? d.upcomingLive.map(x => `
                <div class="student-list-row">
                  <div>
                    <b>${esc(x.title)}</b>
                    <span>${esc(x.course)} · ${fmtDate(x.startAt,true)}</span>
                  </div>
                  ${x.zoomJoinUrl
                    ? '<a class="btn primary" target="_blank" rel="noopener" href="'+esc(x.zoomJoinUrl)+'">انضمام</a>'
                    : status(x.status)}
                </div>
              `).join('') : '<div class="student-empty">لا توجد محاضرات قادمة.</div>'}
            </div>
          </article>

          <article class="student-card">
            <div class="student-card-head">
              <div><h2>ملخص حسابك</h2><p>أشياء مهمة في بوابة الطالب.</p></div>
            </div>

            <div class="student-list">
              <div class="student-list-row"><div><b>الشهادات</b><span>الشهادات الصادرة لك.</span></div><strong>${esc(d.certificates)}</strong></div>
              <div class="student-list-row"><div><b>الإشعارات</b><span>التنبيهات المتاحة داخل النظام.</span></div><strong>${esc(d.notifications)}</strong></div>
              <div class="student-list-row"><div><b>الواجبات</b><span>الواجبات المنشورة حاليًا.</span></div><strong>${esc(d.pendingAssignments)}</strong></div>
            </div>
          </article>
        </section>
      `;
    } catch (err) {
      target.innerHTML = '<div class="student-card student-empty">'+esc(err.message)+'</div>';
    }
  }

  async function renderCourses() {
    const target = document.getElementById('studentPageContent');
    target.innerHTML = '<div class="student-empty">جاري تحميل دوراتك...</div>';

    try {
      const rows = await api('/api/student/courses');
      target.innerHTML = `
        <section class="student-card">
          <div class="student-card-head">
            <div><h2>الدورات المسجل فيها</h2><p>لا تظهر هنا إلا الدورات المرتبطة بحساب الطالب.</p></div>
          </div>

          ${rows.length
            ? '<div class="student-course-grid">'+rows.map(courseCard).join('')+'</div>'
            : '<div class="student-empty">لم يتم تسجيلك في أي دورة حتى الآن.</div>'}
        </section>
      `;
    } catch (err) {
      target.innerHTML = '<div class="student-card student-empty">'+esc(err.message)+'</div>';
    }
  }

  async function renderCourse() {
    const target = document.getElementById('studentPageContent');
    const courseId = new URLSearchParams(location.search).get('id');

    if (!courseId) {
      location.href = '/student/courses.html';
      return;
    }

    target.innerHTML = '<div class="student-empty">جاري تحميل الدورة...</div>';

    try {
      const data = await api('/api/student/courses/'+encodeURIComponent(courseId));
      const lessons = data.lessons || [];
      let activeIndex = Math.max(0,lessons.findIndex(x => !x.completed));
      if (activeIndex < 0) activeIndex = 0;

      const render = () => {
        const lesson = lessons[activeIndex] || null;
        const progress = Number(data.progress?.progress || data.enrollment?.progress || 0);

        target.innerHTML = `
          <section class="student-card">
            <div class="student-card-head">
              <div>
                <h2>${esc(data.course.title)}</h2>
                <p>${esc(data.course.description || 'تابع دروس الدورة بالترتيب وسجل إنجازك.')}</p>
              </div>
              <div class="student-actions">
                <span class="student-status good">${progress}% مكتمل</span>
                <a class="btn ghost" href="/student/courses.html">رجوع</a>
              </div>
            </div>

            <div class="student-progress-line"><i style="width:${Math.max(0,Math.min(100,progress))}%"></i></div>
          </section>

          <section class="student-player-layout student-section">
            <article class="student-player-card">
              <div class="student-player">
                ${lesson?.youtubeId
                  ? '<iframe src="https://www.youtube-nocookie.com/embed/'+encodeURIComponent(lesson.youtubeId)+'" title="'+esc(lesson.title)+'" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>'
                  : '<div class="student-player-placeholder">'+(lesson ? 'هذا الدرس لا يحتوي على فيديو YouTube.' : 'لا توجد دروس منشورة في هذه الدورة حتى الآن.')+'</div>'}
              </div>

              <div class="student-player-info">
                <h2>${esc(lesson?.title || data.course.title)}</h2>
                <p>${esc(lesson?.description || 'اختر درسًا من القائمة لبدء التعلم.')}</p>

                ${lesson ? `
                  <div class="student-actions" style="margin-top:12px">
                    <button class="btn ${lesson.completed ? 'secondary' : 'primary'}" id="lessonCompleteButton" type="button">
                      ${lesson.completed ? 'إلغاء علامة الاكتمال' : '✓ تم إكمال الدرس'}
                    </button>
                    <button class="btn ghost" id="previousLessonButton" type="button" ${activeIndex === 0 ? 'disabled' : ''}>السابق</button>
                    <button class="btn soft" id="nextLessonButton" type="button" ${activeIndex >= lessons.length - 1 ? 'disabled' : ''}>التالي</button>
                  </div>
                ` : ''}
              </div>
            </article>

            <aside class="student-lessons">
              ${lessons.length ? lessons.map((x,i) => `
                <button class="student-lesson ${i === activeIndex ? 'active' : ''} ${x.completed ? 'done' : ''}" data-index="${i}" type="button">
                  <span class="student-lesson-number">${x.completed ? '✓' : esc(x.order || i+1)}</span>
                  <span>
                    <b>${esc(x.title)}</b>
                    <span>${esc(x.durationMinutes || 0)} دقيقة · ${x.completed ? 'مكتمل' : 'غير مكتمل'}</span>
                  </span>
                </button>
              `).join('') : '<div class="student-empty">لا توجد دروس منشورة.</div>'}
            </aside>
          </section>
        `;

        document.querySelectorAll('.student-lesson').forEach(button => {
          button.onclick = () => {
            activeIndex = Number(button.dataset.index);
            render();
            window.scrollTo({top:0,behavior:'smooth'});
          };
        });

        if (lesson) {
          document.getElementById('lessonCompleteButton').onclick = async () => {
            const button = document.getElementById('lessonCompleteButton');
            button.disabled = true;

            try {
              const result = await api('/api/student/lessons/'+encodeURIComponent(lesson.id)+'/progress',{
                method:'POST',
                body:JSON.stringify({completed:!lesson.completed})
              });

              lesson.completed = !lesson.completed;
              data.progress = result;
              data.enrollment.progress = result.progress;
              toast(lesson.completed ? 'تم تسجيل الدرس كمكتمل' : 'تم إلغاء علامة الاكتمال');
              render();
            } catch (err) {
              toast(err.message,'error');
              button.disabled = false;
            }
          };

          document.getElementById('previousLessonButton').onclick = () => {
            if (activeIndex > 0) {
              activeIndex -= 1;
              render();
            }
          };

          document.getElementById('nextLessonButton').onclick = () => {
            if (activeIndex < lessons.length - 1) {
              activeIndex += 1;
              render();
            }
          };
        }
      };

      render();
    } catch (err) {
      target.innerHTML = '<div class="student-card student-empty">'+esc(err.message)+'</div>';
    }
  }

  async function renderLive() {
    const target = document.getElementById('studentPageContent');
    target.innerHTML = '<div class="student-empty">جاري تحميل المحاضرات...</div>';

    try {
      const rows = await api('/api/student/live');
      const now = Date.now();

      target.innerHTML = `
        <section class="student-card">
          <div class="student-card-head">
            <div><h2>المحاضرات المباشرة</h2><p>لا يظهر لك إلا ما يرتبط بالدورات المسجل فيها حسابك.</p></div>
          </div>

          <div class="student-list">
            ${rows.length ? rows.map(row => {
              const future = new Date(row.startAt).getTime() >= now;
              return `
                <div class="student-list-row">
                  <div>
                    <b>${esc(row.title)}</b>
                    <span>${esc(row.course?.title || '')} · ${esc(row.instructor?.name || '')} · ${fmtDate(row.startAt,true)} · ${esc(row.durationMinutes)} دقيقة</span>
                  </div>
                  <div class="student-actions">
                    ${status(row.status)}
                    ${row.zoomJoinUrl && future
                      ? '<a class="btn primary" target="_blank" rel="noopener" href="'+esc(row.zoomJoinUrl)+'">فتح Zoom</a>'
                      : ''}
                  </div>
                </div>
              `;
            }).join('') : '<div class="student-empty">لا توجد محاضرات مرتبطة بدوراتك.</div>'}
          </div>
        </section>
      `;
    } catch (err) {
      target.innerHTML = '<div class="student-card student-empty">'+esc(err.message)+'</div>';
    }
  }

  async function renderAssessments() {
    const target = document.getElementById('studentPageContent');
    target.innerHTML = '<div class="student-empty">جاري تحميل الاختبارات...</div>';

    try {
      const rows = await api('/api/student/assessments?type=quiz');

      target.innerHTML = `
        <section class="student-card">
          <div class="student-card-head">
            <div><h2>اختبارات دوراتك</h2><p>تعرض هذه الصفحة الاختبارات المنشورة من الأكاديمية.</p></div>
          </div>

          ${rows.length ? '<div class="student-assessment-grid">'+rows.map(row => `
            <article class="student-assessment">
              <div class="student-card-head">
                <div>
                  <h3>${esc(row.title)}</h3>
                  <p>${esc(row.course?.title || '')}</p>
                </div>
                ${status(row.status)}
              </div>

              <p>${esc(row.description || 'لا توجد تعليمات إضافية.')}</p>
              <div class="student-meta">
                <span>الدرجة: ${esc(row.totalMarks)}</span>
                <span>النجاح: ${esc(row.passingMark)}</span>
                <span>المدة: ${esc(row.durationMinutes || 0)} دقيقة</span>
                <span>الموعد: ${fmtDate(row.dueAt,true)}</span>
              </div>

              <div class="student-list-row" style="margin-top:11px">
                <div><b>حل الاختبار داخل النظام</b><span>يتفعّل عندما تتم إضافة بنك الأسئلة للاختبار.</span></div>
                <span class="student-status warn">قيد التجهيز</span>
              </div>
            </article>
          `).join('')+'</div>' : '<div class="student-empty">لا توجد اختبارات منشورة حاليًا.</div>'}
        </section>
      `;
    } catch (err) {
      target.innerHTML = '<div class="student-card student-empty">'+esc(err.message)+'</div>';
    }
  }

  function openAssignment(row,onDone) {
    const modal = document.getElementById('studentModal');
    const body = document.getElementById('studentModalBody');

    document.getElementById('studentModalTitle').textContent = row.title;
    document.getElementById('studentModalSubtitle').textContent = (row.course?.title || '')+' · آخر موعد: '+fmtDate(row.dueAt,true);

    body.innerHTML = `
      <form id="assignmentForm">
        <div class="field">
          <label>الإجابة</label>
          <textarea name="answerText" placeholder="اكتب إجابتك هنا...">${esc(row.submission?.answerText || '')}</textarea>
        </div>

        <div class="field">
          <label>رابط مرفق — اختياري</label>
          <input name="attachmentUrl" type="url" placeholder="https://..." value="${esc(row.submission?.attachmentUrl || '')}">
        </div>

        <div class="student-form-message" id="assignmentMessage"></div>

        <div class="student-actions" style="justify-content:flex-end">
          <button class="btn ghost" id="assignmentCancel" type="button">إلغاء</button>
          <button class="btn primary" type="submit">${row.submission ? 'تحديث التسليم' : 'تسليم الواجب'}</button>
        </div>
      </form>
    `;

    modal.hidden = false;
    document.getElementById('assignmentCancel').onclick = () => modal.hidden = true;

    document.getElementById('assignmentForm').onsubmit = async e => {
      e.preventDefault();

      const form = e.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      const message = document.getElementById('assignmentMessage');
      const original = button.textContent;
      button.disabled = true;
      button.textContent = 'جاري التسليم...';
      message.textContent = '';

      try {
        const data = Object.fromEntries(new FormData(form).entries());

        await api('/api/student/assignments/'+encodeURIComponent(row.id)+'/submission',{
          method:'POST',
          body:JSON.stringify(data)
        });

        modal.hidden = true;
        toast('تم تسليم الواجب بنجاح');
        await onDone();
      } catch (err) {
        message.textContent = err.message;
      } finally {
        button.disabled = false;
        button.textContent = original;
      }
    };
  }

  async function renderAssignments() {
    const target = document.getElementById('studentPageContent');
    target.innerHTML = '<div class="student-empty">جاري تحميل الواجبات...</div>';

    const load = async () => {
      try {
        const rows = await api('/api/student/assessments?type=assignment');

        target.innerHTML = `
          <section class="student-card">
            <div class="student-card-head">
              <div><h2>واجبات دوراتك</h2><p>اكتب الإجابة أو أرفق رابطًا، ويمكنك تحديث التسليم قبل إغلاق الواجب.</p></div>
            </div>

            ${rows.length ? '<div class="student-assessment-grid">'+rows.map((row,i) => `
              <article class="student-assessment">
                <div class="student-card-head">
                  <div><h3>${esc(row.title)}</h3><p>${esc(row.course?.title || '')}</p></div>
                  ${row.submission ? status(row.submission.status) : status(row.status)}
                </div>

                <p>${esc(row.description || 'لا توجد تعليمات إضافية.')}</p>

                <div class="student-meta">
                  <span>الدرجة: ${esc(row.totalMarks)}</span>
                  <span>آخر موعد: ${fmtDate(row.dueAt,true)}</span>
                  ${row.submission?.score !== null && row.submission?.score !== undefined ? '<span>درجتك: '+esc(row.submission.score)+'</span>' : ''}
                </div>

                ${row.submission?.feedback ? '<div class="note-box" style="margin-top:10px">تعليق المدرب: '+esc(row.submission.feedback)+'</div>' : ''}

                <button class="btn ${row.status === 'closed' ? 'ghost' : 'primary'} assignment-open" data-index="${i}" type="button" style="margin-top:12px;width:100%" ${row.status === 'closed' ? 'disabled' : ''}>
                  ${row.submission ? 'عرض / تحديث التسليم' : 'تسليم الواجب'}
                </button>
              </article>
            `).join('')+'</div>' : '<div class="student-empty">لا توجد واجبات منشورة حاليًا.</div>'}
          </section>
        `;

        document.querySelectorAll('.assignment-open').forEach(button => {
          button.onclick = () => openAssignment(rows[Number(button.dataset.index)],load);
        });
      } catch (err) {
        target.innerHTML = '<div class="student-card student-empty">'+esc(err.message)+'</div>';
      }
    };

    await load();
  }

  async function renderPayments() {
    const target = document.getElementById('studentPageContent');
    target.innerHTML = '<div class="student-empty">جاري تحميل المدفوعات...</div>';

    try {
      const data = await api('/api/student/payments');

      target.innerHTML = `
        <section class="student-kpis">
          ${kpi('المدفوع',fmtMoney(data.summary.paid))}
          ${kpi('المعلق',fmtMoney(data.summary.pending))}
          ${kpi('المسترجع',fmtMoney(data.summary.refunded))}
        </section>

        <section class="student-card">
          <div class="student-card-head"><div><h2>سجل المدفوعات</h2><p>الدفعات المسجلة على حساب الطالب.</p></div></div>

          <div class="student-table-wrap">
            <table class="student-table">
              <thead><tr><th>الدورة</th><th>المبلغ</th><th>الطريقة</th><th>الحالة</th><th>المرجع</th><th>التاريخ</th></tr></thead>
              <tbody>
                ${data.rows.length ? data.rows.map(row => `
                  <tr>
                    <td>${esc(row.courseId?.title || 'دفعة عامة')}</td>
                    <td><b>${fmtMoney(row.amount,row.currency)}</b></td>
                    <td>${esc(row.method)}</td>
                    <td>${status(row.status)}</td>
                    <td>${esc(row.reference || '—')}</td>
                    <td>${fmtDate(row.paidAt)}</td>
                  </tr>
                `).join('') : '<tr><td colspan="6" class="student-empty">لا توجد دفعات مسجلة.</td></tr>'}
              </tbody>
            </table>
          </div>
        </section>
      `;
    } catch (err) {
      target.innerHTML = '<div class="student-card student-empty">'+esc(err.message)+'</div>';
    }
  }

  async function renderCertificates() {
    const target = document.getElementById('studentPageContent');
    target.innerHTML = '<div class="student-empty">جاري تحميل الشهادات...</div>';

    try {
      const rows = await api('/api/student/certificates');

      target.innerHTML = `
        <section class="student-card">
          <div class="student-card-head">
            <div><h2>شهاداتي</h2><p>الشهادات الصادرة رسميًا لحسابك.</p></div>
            ${rows.length ? '<button class="btn secondary" id="printCertificates">طباعة</button>' : ''}
          </div>

          ${rows.length ? '<div class="student-assessment-grid">'+rows.map(row => `
            <article class="student-certificate">
              <span class="student-status good">شهادة صادرة</span>
              <h3>${esc(row.courseId?.title || 'شهادة إتمام')}</h3>
              <div class="student-certificate-number">${esc(row.certificateNo)}</div>
              <div class="student-meta">
                <span>تاريخ الإصدار: ${fmtDate(row.issuedAt)}</span>
                <span>${esc(row.courseId?.code || '')}</span>
              </div>
            </article>
          `).join('')+'</div>' : '<div class="student-empty">لا توجد شهادات صادرة لك حتى الآن.</div>'}
        </section>
      `;

      const print = document.getElementById('printCertificates');
      if (print) print.onclick = () => window.print();
    } catch (err) {
      target.innerHTML = '<div class="student-card student-empty">'+esc(err.message)+'</div>';
    }
  }

  async function renderNotifications() {
    const target = document.getElementById('studentPageContent');
    target.innerHTML = '<div class="student-empty">جاري تحميل الإشعارات...</div>';

    try {
      const rows = await api('/api/student/notifications');

      target.innerHTML = `
        <section class="student-card">
          <div class="student-card-head"><div><h2>الإشعارات</h2><p>آخر التنبيهات الموجهة للطلاب أو لجميع مستخدمي الأكاديمية.</p></div></div>

          ${rows.length ? rows.map(row => `
            <article class="student-notification">
              <h3>${esc(row.title)}</h3>
              <p>${esc(row.message)}</p>
              <small>${fmtDate(row.sentAt || row.createdAt,true)}</small>
            </article>
          `).join('') : '<div class="student-empty">لا توجد إشعارات جديدة.</div>'}
        </section>
      `;
    } catch (err) {
      target.innerHTML = '<div class="student-card student-empty">'+esc(err.message)+'</div>';
    }
  }

  function openPasswordModal() {
    const modal = document.getElementById('studentModal');
    const body = document.getElementById('studentModalBody');

    document.getElementById('studentModalTitle').textContent = 'تغيير كلمة المرور';
    document.getElementById('studentModalSubtitle').textContent = 'استخدم كلمة مرور جديدة لا تقل عن 10 أحرف.';

    body.innerHTML = `
      <form id="passwordForm">
        <div class="field"><label>كلمة المرور الحالية</label><input name="currentPassword" type="password" autocomplete="current-password" required></div>
        <div class="field"><label>كلمة المرور الجديدة</label><input name="newPassword" type="password" minlength="10" autocomplete="new-password" required></div>
        <div class="student-form-message" id="passwordMessage"></div>
        <div class="student-actions" style="justify-content:flex-end">
          <button class="btn ghost" id="passwordCancel" type="button">إلغاء</button>
          <button class="btn primary" type="submit">تغيير كلمة المرور</button>
        </div>
      </form>
    `;

    modal.hidden = false;
    document.getElementById('passwordCancel').onclick = () => modal.hidden = true;

    document.getElementById('passwordForm').onsubmit = async e => {
      e.preventDefault();
      const form = e.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      const message = document.getElementById('passwordMessage');
      const original = button.textContent;

      button.disabled = true;
      button.textContent = 'جاري التغيير...';
      message.textContent = '';

      try {
        await api('/api/student/profile/password',{
          method:'POST',
          body:JSON.stringify(Object.fromEntries(new FormData(form).entries()))
        });

        modal.hidden = true;
        toast('تم تغيير كلمة المرور');
      } catch (err) {
        message.textContent = err.message;
      } finally {
        button.disabled = false;
        button.textContent = original;
      }
    };
  }

  async function renderProfile() {
    const target = document.getElementById('studentPageContent');
    target.innerHTML = '<div class="student-empty">جاري تحميل حسابك...</div>';

    try {
      const data = await api('/api/student/profile');

      target.innerHTML = `
        <section class="student-profile-grid">
          <aside class="student-profile-card">
            <div class="student-profile-avatar">${esc((data.user.name || 'ST').slice(0,2).toUpperCase())}</div>
            <h2>${esc(data.user.name)}</h2>
            <p>${esc(data.user.email)}</p>

            <div class="student-meta">
              <span>${esc(data.academy.name)}</span>
              <span>${esc(data.academy.code)}</span>
              <span>طالب</span>
            </div>

            <button class="btn ghost wide" id="changePasswordButton" type="button" style="margin-top:14px">تغيير كلمة المرور</button>
          </aside>

          <form class="student-card" id="profileForm">
            <div class="student-card-head">
              <div><h2>بياناتي</h2><p>يمكنك تحديث الاسم ورقم الهاتف. البريد يدار بواسطة الأكاديمية.</p></div>
            </div>

            <div class="field"><label>الاسم</label><input name="name" value="${esc(data.user.name || '')}" required></div>
            <div class="field"><label>البريد الإلكتروني</label><input value="${esc(data.user.email || '')}" disabled></div>
            <div class="field"><label>رقم الهاتف</label><input name="phone" value="${esc(data.user.phone || '')}"></div>

            <div class="student-form-message" id="profileMessage"></div>
            <button class="btn primary" type="submit">حفظ البيانات</button>
          </form>
        </section>
      `;

      document.getElementById('changePasswordButton').onclick = openPasswordModal;

      document.getElementById('profileForm').onsubmit = async e => {
        e.preventDefault();

        const form = e.currentTarget;
        const button = form.querySelector('button[type="submit"]');
        const message = document.getElementById('profileMessage');
        const original = button.textContent;

        button.disabled = true;
        button.textContent = 'جاري الحفظ...';
        message.textContent = '';

        try {
          const saved = await api('/api/student/profile',{
            method:'PATCH',
            body:JSON.stringify(Object.fromEntries(new FormData(form).entries()))
          });

          user.name = saved.name;
          localStorage.setItem('af_user',JSON.stringify(user));
          toast('تم حفظ بيانات الحساب');
          await renderProfile();
        } catch (err) {
          message.textContent = err.message;
        } finally {
          button.disabled = false;
          button.textContent = original;
        }
      };
    } catch (err) {
      target.innerHTML = '<div class="student-card student-empty">'+esc(err.message)+'</div>';
    }
  }

  async function init() {
    renderShell();

    if (page === 'dashboard') return renderDashboard();
    if (page === 'courses') return renderCourses();
    if (page === 'course') return renderCourse();
    if (page === 'live') return renderLive();
    if (page === 'assessments') return renderAssessments();
    if (page === 'assignments') return renderAssignments();
    if (page === 'payments') return renderPayments();
    if (page === 'certificates') return renderCertificates();
    if (page === 'notifications') return renderNotifications();
    if (page === 'profile') return renderProfile();

    document.getElementById('studentPageContent').innerHTML = '<div class="student-card student-empty">الصفحة غير موجودة.</div>';
  }

  document.addEventListener('DOMContentLoaded',init);
  return { api };
})();