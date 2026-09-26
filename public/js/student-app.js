const StudentPortal = (() => {
  let user = null;

  try {
    user = JSON.parse(localStorage.getItem('af_user') || 'null');
  } catch {}

  if (!user || user.role !== 'student') {
    location.href = '/academy/login.html';
    return {};
  }

  const page = document.body.dataset.page || 'dashboard';
  let profileCache = null;
  let modalSubmit = null;

  const meta = {
    dashboard: ['مرحبًا '+(user.name || 'بالطالب'),'تابع دراستك، تقدمك، ومحاضراتك من مكان واحد.'],
    courses: ['دوراتي','كل الدورات المسجل فيها حسابك ونسبة تقدمك.'],
    course: ['الدورة','شاهد الدروس وأكملها بالتسلسل داخل AcademyFlow.'],
    live: ['المحاضرات المباشرة','جلسات Zoom المرتبطة بالدورات المسجل فيها حسابك.'],
    assignments: ['الواجبات','تابع المطلوب منك وسلّم إجابتك من نفس الصفحة.'],
    quizzes: ['الاختبارات','ابدأ الاختبارات وتابع محاولاتك ونتائجك.'],
    quiz: ['حل الاختبار','أجب عن الأسئلة وسيتم حفظ إجاباتك تلقائيًا.'],
    payments: ['المدفوعات','سجل الدفعات وحالتها والمبالغ المسجلة على حسابك.'],
    certificates: ['الشهادات','شهاداتك الصادرة من الأكاديمية.'],
    notifications: ['الإشعارات','آخر التنبيهات والإعلانات الموجهة للطلاب.'],
    profile: ['حسابي','بيانات حسابك وتغيير كلمة المرور.']
  };

  const nav = [
    ['dashboard','الرئيسية','⌂'],
    ['courses','دوراتي','C'],
    ['live','المحاضرات','Z'],
    ['assignments','الواجبات','A'],
    ['quizzes','الاختبارات','Q'],
    ['payments','المدفوعات','P'],
    ['certificates','الشهادات','✓'],
    ['notifications','الإشعارات','N'],
    ['profile','حسابي','U']
  ];

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

  function fmtMoney(value, currency='OMR') {
    return new Intl.NumberFormat('en-OM',{
      style:'currency',
      currency,
      maximumFractionDigits:3
    }).format(Number(value || 0));
  }

  function status(value) {
    const map = {
      active:['نشط','good'],
      completed:['مكتمل','good'],
      paid:['مدفوع','good'],
      issued:['صادرة','good'],
      live:['مباشر','good'],
      submitted:['تم التسليم','good'],
      graded:['تم التصحيح','good'],
      scheduled:['مجدول','warn'],
      paused:['متوقف مؤقتًا','warn'],
      pending:['معلق','warn'],
      published:['منشور','good'],
      closed:['مغلق','bad'],
      ended:['انتهت','info'],
      cancelled:['ملغي','bad'],
      refunded:['مسترجع','bad'],
      failed:['فشل','bad']
    };
    const item = map[value] || [value || '—','info'];
    return '<span class="student-status '+item[1]+'">'+esc(item[0])+'</span>';
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
        localStorage.removeItem('af_token');
        localStorage.removeItem('af_user');
        location.href = '/academy/login.html';
      }
    }

    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    if (!response.ok) {
      throw new Error(data?.message || 'تعذر تنفيذ العملية');
    }

    return data;
  }

  function route(name) {
    return '/student/'+name+'.html';
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

          <div class="student-nav-title">التعلم</div>
          <nav class="student-nav">
            ${nav.slice(0,5).map(x => navItem(x)).join('')}
          </nav>

          <div class="student-nav-title">حسابي</div>
          <nav class="student-nav">
            ${nav.slice(5).map(x => navItem(x)).join('')}
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
              <div style="display:flex;gap:9px;align-items:flex-start;min-width:0">
                <button class="student-menu-btn" id="studentMenuButton" type="button" aria-label="فتح القائمة">☰</button>
                <div class="student-heading">
                  <span class="student-eyebrow">STUDENT PORTAL</span>
                  <h1>${esc(current[0])}</h1>
                  <p>${esc(current[1])}</p>
                </div>
              </div>

              <div class="student-top-actions">
                <button class="theme-toggle" data-theme-toggle data-theme-icon type="button" title="فاتح / داكن">◐</button>
                <div class="student-user">
                  <span class="student-avatar">${esc((user.name || 'ST').slice(0,2).toUpperCase())}</span>
                  <span><b>${esc(user.name || 'الطالب')}</b><span>${esc(user.email || '')}</span></span>
                </div>
                <button class="btn ghost" id="studentLogout" type="button">خروج ↗</button>
              </div>
            </header>

            <section id="studentPageContent"></section>
            <div class="student-footer">AcademyFlow · Student Portal</div>
          </div>
        </main>
      </div>

      <section class="student-modal" id="studentModal" hidden>
        <div class="student-modal-card">
          <div class="student-modal-head">
            <div><h2 id="studentModalTitle">إجراء</h2><p id="studentModalSubtitle"></p></div>
            <button class="icon-btn" id="studentModalClose" type="button">×</button>
          </div>
          <form id="studentModalForm"></form>
        </div>
      </section>
    `;

    const sidebar = document.getElementById('studentSidebar');
    const overlay = document.getElementById('studentOverlay');

    const close = () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
    };

    document.getElementById('studentMenuButton').onclick = () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('show');
    };

    overlay.onclick = close;
    document.querySelectorAll('.student-nav a').forEach(a => a.addEventListener('click',close));

    document.getElementById('studentLogout').onclick = async () => {
      try {
        await fetch('/api/auth/logout', { method:'POST', credentials:'same-origin' });
      } catch {}
      localStorage.removeItem('af_token');
      localStorage.removeItem('af_user');
      location.replace('/academy/login.html');
    };

    const modal = document.getElementById('studentModal');
    document.getElementById('studentModalClose').onclick = () => closeModal();
    modal.addEventListener('click',e => {
      if (e.target === modal) closeModal();
    });
  }

  function navItem(item) {
    const isActive = item[0] === page || (page === 'course' && item[0] === 'courses') || (page === 'quiz' && item[0] === 'quizzes');
    return '<a class="'+(isActive ? 'active' : '')+'" href="'+route(item[0])+'"><span class="student-nav-icon">'+esc(item[2])+'</span>'+esc(item[1])+'</a>';
  }

  function openModal({title,subtitle='',html,onSubmit}) {
    const modal = document.getElementById('studentModal');
    const form = document.getElementById('studentModalForm');

    document.getElementById('studentModalTitle').textContent = title;
    document.getElementById('studentModalSubtitle').textContent = subtitle;
    form.innerHTML = html;
    modal.hidden = false;
    modalSubmit = onSubmit || null;

    form.onsubmit = async e => {
      e.preventDefault();
      if (!modalSubmit) return;

      const button = form.querySelector('button[type="submit"]');
      const msg = form.querySelector('.student-form-message');
      const original = button.textContent;

      button.disabled = true;
      button.textContent = 'جاري الحفظ...';
      if (msg) msg.textContent = '';

      try {
        await modalSubmit(Object.fromEntries(new FormData(form).entries()),msg);
      } catch (err) {
        if (msg) msg.textContent = err.message;
      } finally {
        button.disabled = false;
        button.textContent = original;
      }
    };
  }

  function closeModal() {
    document.getElementById('studentModal').hidden = true;
    modalSubmit = null;
  }

  function kpi(label,value) {
    return '<article class="student-kpi"><small>'+esc(label)+'</small><strong>'+esc(value ?? 0)+'</strong></article>';
  }

  function progressBar(value) {
    const n = Math.max(0,Math.min(100,Number(value || 0)));
    return '<div class="student-progress-line"><i style="width:'+n+'%"></i></div><div class="student-progress-caption"><span>التقدم</span><b>'+n+'%</b></div>';
  }

  function courseCard(row) {
    const c = row.course;
    return `
      <article class="student-course">
        <div class="student-course-cover">
          ${c.thumbnailUrl ? '<img src="'+esc(c.thumbnailUrl)+'" alt="">' : esc((c.title || 'C').slice(0,2))}
        </div>
        <div class="student-course-body">
          <h3>${esc(c.title)}</h3>
          <p>${esc(c.description || 'هذه الدورة ضمن تسجيلك الحالي في الأكاديمية.')}</p>
          <div class="student-meta">
            <span>${esc(c.code || 'بدون كود')}</span>
            <span>${esc(c.category || 'عام')}</span>
            <span>${esc(c.instructor?.name || c.instructor || 'بدون مدرب')}</span>
          </div>
          ${progressBar(row.progress)}
          <a class="btn primary" href="/student/course.html?id=${encodeURIComponent(c._id || c.id)}">متابعة الدورة</a>
        </div>
      </article>
    `;
  }

  function bindLiveJoinButtons() {
    document.querySelectorAll('.student-join-live').forEach(button => {
      button.onclick = async () => {
        const sessionId = button.dataset.sessionId;
        const popup = window.open('about:blank', '_blank');
        const original = button.textContent;

        button.disabled = true;
        button.textContent = 'جاري تسجيل الحضور...';

        try {
          const data = await api('/api/student/live/' + encodeURIComponent(sessionId) + '/join', {
            method: 'POST'
          });

          button.textContent = data.attendance?.attendanceStatus === 'late'
            ? 'تم تسجيلك متأخرًا'
            : 'تم تسجيل الحضور';

          if (popup) popup.location.href = data.joinUrl;
          else location.href = data.joinUrl;
        } catch (err) {
          if (popup) popup.close();
          button.disabled = false;
          button.textContent = original;
          alert(err.message);
        }
      };
    });
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
          ${kpi('الواجبات',d.pendingAssignments)}
        </section>

        <section class="student-card">
          <div class="student-card-head">
            <div><h2>واصل من حيث توقفت</h2><p>أحدث الدورات في حسابك.</p></div>
            <a class="btn soft" href="/student/courses.html">كل الدورات</a>
          </div>
          ${d.recentCourses?.length
            ? '<div class="student-course-grid">'+d.recentCourses.map(courseCard).join('')+'</div>'
            : '<div class="student-empty">لا توجد دورات مرتبطة بحسابك حتى الآن.</div>'}
        </section>

        <section class="student-grid-2 student-section">
          <article class="student-card">
            <div class="student-card-head"><div><h2>المحاضرات القادمة</h2><p>أقرب جلسات Zoom.</p></div><a class="btn soft" href="/student/live.html">عرض الكل</a></div>
            <div class="student-list">
              ${d.upcomingLive?.length ? d.upcomingLive.map(x => `
                <div class="student-list-row">
                  <div><b>${esc(x.title)}</b><span>${fmtDate(x.startAt,true)} · ${esc(x.course || '')}</span></div>
                  ${x.joinAvailable ? '<button class="btn primary student-join-live" data-session-id="'+esc(x.id)+'" type="button">انضم عبر AcademyFlow</button>' : status(x.status)}
                </div>
              `).join('') : '<div class="student-empty">لا توجد محاضرات قادمة.</div>'}
            </div>
          </article>

          <article class="student-card">
            <div class="student-card-head"><div><h2>حسابك الدراسي</h2><p>ملخص سريع.</p></div></div>
            <div class="student-list">
              <div class="student-list-row"><div><b>الشهادات</b><span>شهادات صادرة باسمك.</span></div><strong>${esc(d.certificates)}</strong></div>
              <div class="student-list-row"><div><b>الإشعارات</b><span>آخر الإعلانات الطلابية.</span></div><strong>${esc(d.notifications)}</strong></div>
              <div class="student-list-row"><div><b>متوسط الإنجاز</b><span>بحسب الدروس المكتملة.</span></div><strong>${esc(d.averageProgress)}%</strong></div>
            </div>
          </article>
        </section>
      `;
      bindLiveJoinButtons();
    } catch (err) {
      target.innerHTML = '<div class="student-card student-empty">'+esc(err.message)+'</div>';
    }
  }

  async function renderCourses() {
    const target = document.getElementById('studentPageContent');
    target.innerHTML = '<div class="student-empty">جاري تحميل الدورات...</div>';

    try {
      const rows = await api('/api/student/courses');
      target.innerHTML = rows.length
        ? '<div class="student-course-grid">'+rows.map(courseCard).join('')+'</div>'
        : '<div class="student-card student-empty">لا توجد دورات مسجل فيها حسابك حاليًا.</div>';
    } catch (err) {
      target.innerHTML = '<div class="student-card student-empty">'+esc(err.message)+'</div>';
    }
  }

  async function renderCourse() {
    const target = document.getElementById('studentPageContent');
    const courseId = new URLSearchParams(location.search).get('id');

    if (!courseId) {
      target.innerHTML = '<div class="student-card student-empty">لم يتم تحديد دورة.</div>';
      return;
    }

    target.innerHTML = '<div class="student-empty">جاري تحميل الدورة...</div>';

    try {
      const data = await api('/api/student/courses/'+encodeURIComponent(courseId));
      const lessons = data.lessons || [];
      let activeId = lessons.find(x => !x.completed)?.id || lessons[0]?.id || null;

      const draw = () => {
        const active = lessons.find(x => String(x.id) === String(activeId)) || lessons[0];

        target.innerHTML = `
          <section class="student-card" style="margin-bottom:11px">
            <div class="student-card-head">
              <div><h2>${esc(data.course.title)}</h2><p>${esc(data.course.description || '')}</p></div>
              <div class="student-actions">
                <span class="student-status good">${esc(data.progress.progress)}%</span>
                <a class="btn ghost" href="/student/courses.html">رجوع للدورات</a>
              </div>
            </div>
            ${progressBar(data.progress.progress)}
          </section>

          ${lessons.length ? `
            <section class="student-player-layout">
              <article class="student-player-card">
                <div class="student-player">
                  ${active?.youtubeId
                    ? '<iframe loading="lazy" src="https://www.youtube-nocookie.com/embed/'+encodeURIComponent(active.youtubeId)+'?rel=0" title="'+esc(active.title)+'" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>'
                    : '<div class="student-player-placeholder">هذا الدرس لا يحتوي على فيديو YouTube.</div>'}
                </div>
                <div class="student-player-info">
                  <h2>${esc(active?.title || '')}</h2>
                  <p>${esc(active?.description || '')}</p>
                  <div class="student-meta">
                    <span>الدرس ${esc(active?.order || '')}</span>
                    <span>${esc(active?.durationMinutes || 0)} دقيقة</span>
                    ${active?.completed ? '<span>✓ مكتمل</span>' : '<span>غير مكتمل</span>'}
                  </div>
                  <div class="student-actions" style="margin-top:12px">
                    <button class="btn ${active?.completed ? 'ghost' : 'primary'}" id="lessonCompleteButton" type="button">
                      ${active?.completed ? 'إلغاء الإكمال' : 'تم إكمال الدرس'}
                    </button>
                  </div>
                </div>
              </article>

              <aside class="student-lessons">
                ${lessons.map(x => `
                  <button class="student-lesson ${String(x.id) === String(activeId) ? 'active' : ''} ${x.completed ? 'done' : ''}" data-lesson-id="${esc(x.id)}" type="button">
                    <span class="student-lesson-number">${x.completed ? '✓' : esc(x.order)}</span>
                    <span><b>${esc(x.title)}</b><span>${esc(x.durationMinutes || 0)} دقيقة · ${x.completed ? 'مكتمل' : 'لم يكتمل'}</span></span>
                  </button>
                `).join('')}
              </aside>
            </section>
          ` : '<div class="student-card student-empty">لم تنشر الأكاديمية دروسًا في هذه الدورة حتى الآن.</div>'}
        `;

        document.querySelectorAll('.student-lesson').forEach(btn => {
          btn.onclick = () => {
            activeId = btn.dataset.lessonId;
            draw();
          };
        });

        const complete = document.getElementById('lessonCompleteButton');
        if (complete && active) {
          complete.onclick = async () => {
            complete.disabled = true;
            const nextCompleted = !active.completed;
            try {
              const result = await api('/api/student/lessons/'+encodeURIComponent(active.id)+'/progress',{
                method:'POST',
                body:JSON.stringify({completed:nextCompleted})
              });

              active.completed = nextCompleted;
              data.progress = result;
              data.enrollment.progress = result.progress;

              if (nextCompleted) {
                const next = lessons.find(x => !x.completed);
                if (next) activeId = next.id;
              }

              draw();
            } catch (err) {
              alert(err.message);
              complete.disabled = false;
            }
          };
        }
      };

      draw();
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
          <div class="student-card-head"><div><h2>جلسات Zoom</h2><p>لا يظهر لك إلا الجلسات المرتبطة بدوراتك.</p></div></div>
          <div class="student-list">
            ${rows.length ? rows.map(x => {
              const joinable = x.joinAvailable && !['ended','cancelled'].includes(x.status);
              return `
                <div class="student-list-row">
                  <div><b>${esc(x.title)}</b><span>${esc(x.course?.title || '')} · ${fmtDate(x.startAt,true)} · ${esc(x.instructor?.name || '')}</span></div>
                  <div class="student-actions">
                    ${status(x.status)}
                    ${joinable ? '<button class="btn primary student-join-live" data-session-id="'+esc(x.id)+'" type="button">دخول Zoom</button>' : ''}
                  </div>
                </div>
              `;
            }).join('') : '<div class="student-empty">لا توجد محاضرات مرتبطة بدوراتك.</div>'}
          </div>
        </section>
      `;
      bindLiveJoinButtons();
    } catch (err) {
      target.innerHTML = '<div class="student-card student-empty">'+esc(err.message)+'</div>';
    }
  }

  async function renderAssignments() {
    const target = document.getElementById('studentPageContent');
    target.innerHTML = '<div class="student-empty">جاري تحميل الواجبات...</div>';

    const load = async () => {
      try {
        const rows = await api('/api/student/assessments?type=assignment');

        target.innerHTML = rows.length ? '<div class="student-assessment-grid">'+rows.map((x,i) => `
          <article class="student-assessment">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
              <div><h3>${esc(x.title)}</h3><p>${esc(x.course?.title || '')}</p></div>
              ${x.submission ? status(x.submission.status) : status(x.status)}
            </div>
            <p>${esc(x.description || 'لا توجد تعليمات إضافية.')}</p>
            <div class="student-meta">
              <span>الدرجة: ${esc(x.totalMarks)}</span>
              <span>التسليم: ${fmtDate(x.dueAt,true)}</span>
              ${x.submission?.score !== null && x.submission?.score !== undefined ? '<span>درجتك: '+esc(x.submission.score)+'</span>' : ''}
            </div>
            ${x.submission?.feedback ? '<div class="student-card" style="box-shadow:none;margin-top:10px;padding:10px"><small>تعليق المدرب</small><p style="margin:4px 0 0">'+esc(x.submission.feedback)+'</p></div>' : ''}
            <button class="btn ${x.submission ? 'soft' : 'primary'} student-submit-assignment" data-index="${i}" type="button" style="margin-top:11px;width:100%">
              ${x.submission ? 'تعديل التسليم' : 'تسليم الواجب'}
            </button>
          </article>
        `).join('')+'</div>' : '<div class="student-card student-empty">لا توجد واجبات منشورة حاليًا.</div>';

        document.querySelectorAll('.student-submit-assignment').forEach(btn => {
          btn.onclick = () => openAssignment(rows[Number(btn.dataset.index)],load);
        });
      } catch (err) {
        target.innerHTML = '<div class="student-card student-empty">'+esc(err.message)+'</div>';
      }
    };

    await load();
  }

  function openAssignment(row,onDone) {
    openModal({
      title:'تسليم الواجب',
      subtitle:row.title+' · '+(row.course?.title || ''),
      html:`
        <div class="field">
          <label>إجابتك</label>
          <textarea name="answerText" rows="7" placeholder="اكتب إجابتك هنا...">${esc(row.submission?.answerText || '')}</textarea>
        </div>
        <div class="field">
          <label>رابط ملف مرفق (اختياري)</label>
          <input name="attachmentUrl" type="url" placeholder="https://..." value="${esc(row.submission?.attachmentUrl || '')}">
        </div>
        <div class="student-form-message"></div>
        <div class="student-actions" style="justify-content:flex-end">
          <button class="btn primary" type="submit">إرسال الواجب</button>
        </div>
      `,
      onSubmit:async data => {
        await api('/api/student/assignments/'+encodeURIComponent(row.id)+'/submission',{
          method:'POST',
          body:JSON.stringify(data)
        });
        closeModal();
        await onDone();
      }
    });
  }

  async function renderQuizzes() {
    const target = document.getElementById('studentPageContent');
    target.innerHTML = '<div class="student-empty">جاري تحميل الاختبارات...</div>';

    try {
      const rows = await api('/api/student/assessments?type=quiz');

      target.innerHTML = rows.length ? '<div class="student-assessment-grid">'+rows.map(x => `
        <article class="student-assessment">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
            <div><h3>${esc(x.title)}</h3><p>${esc(x.course?.title || '')}</p></div>
            ${status(x.status)}
          </div>
          <p>${esc(x.description || 'لا توجد تعليمات إضافية.')}</p>
          <div class="student-meta">
            <span>الدرجة: ${esc(x.totalMarks)}</span>
            <span>النجاح: ${esc(x.passingMark)}</span>
            <span>المدة: ${esc(x.durationMinutes || 0)} دقيقة</span>
            <span>الموعد: ${fmtDate(x.dueAt,true)}</span>
          </div>
          <div class="student-card" style="box-shadow:none;margin-top:11px;padding:10px">
            <small style="color:var(--text-mute)">واجهة حل الأسئلة التفصيلية ستُفعل عندما تضيف الأكاديمية أسئلة للاختبار.</small>
          </div>
        </article>
      `).join('')+'</div>' : '<div class="student-card student-empty">لا توجد اختبارات منشورة حاليًا.</div>';
    } catch (err) {
      target.innerHTML = '<div class="student-card student-empty">'+esc(err.message)+'</div>';
    }
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
          ${kpi('عدد العمليات',data.rows.length)}
        </section>

        <section class="student-card">
          <div class="student-card-head"><div><h2>سجل المدفوعات</h2><p>الدفعات المرتبطة بحسابك فقط.</p></div></div>
          <div class="student-table-wrap">
            <table class="student-table">
              <thead><tr><th>الدورة</th><th>المبلغ</th><th>الطريقة</th><th>الحالة</th><th>المرجع</th><th>التاريخ</th></tr></thead>
              <tbody>
                ${data.rows.length ? data.rows.map(x => `
                  <tr>
                    <td>${esc(x.courseId?.title || 'عام')}</td>
                    <td><b>${fmtMoney(x.amount,x.currency || 'OMR')}</b></td>
                    <td>${esc(x.method)}</td>
                    <td>${status(x.status)}</td>
                    <td>${esc(x.reference || '—')}</td>
                    <td>${fmtDate(x.paidAt)}</td>
                  </tr>
                `).join('') : '<tr><td colspan="6" class="student-empty">لا توجد مدفوعات مسجلة.</td></tr>'}
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
            <div><h2>شهاداتي</h2><p>الشهادات الصادرة والمعتمدة في حسابك.</p></div>
            ${rows.length ? '<button class="btn secondary" id="printCertificates" type="button">طباعة</button>' : ''}
          </div>
          ${rows.length ? '<div class="student-course-grid">'+rows.map(x => `
            <article class="student-certificate">
              <span class="student-status good">شهادة صادرة</span>
              <h3>${esc(x.courseId?.title || 'دورة')}</h3>
              <p style="margin:0;color:var(--text-mute);font-size:10px">صادرة باسم ${esc(user.name || 'الطالب')}</p>
              <div class="student-certificate-number" style="margin-top:12px">${esc(x.certificateNo)}</div>
              <div class="student-meta"><span>${fmtDate(x.issuedAt)}</span><span>${esc(x.courseId?.code || '')}</span></div>
            </article>
          `).join('')+'</div>' : '<div class="student-empty">لم تصدر لك شهادات حتى الآن.</div>'}
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
          <div class="student-card-head"><div><h2>آخر الإشعارات</h2><p>إشعارات الأكاديمية الموجهة للطلاب.</p></div></div>
          ${rows.length ? rows.map(x => `
            <article class="student-notification">
              <h3>${esc(x.title)}</h3>
              <p>${esc(x.message)}</p>
              <small>${fmtDate(x.sentAt || x.createdAt,true)}</small>
            </article>
          `).join('') : '<div class="student-empty">لا توجد إشعارات حاليًا.</div>'}
        </section>
      `;
    } catch (err) {
      target.innerHTML = '<div class="student-card student-empty">'+esc(err.message)+'</div>';
    }
  }

  async function renderProfile() {
    const target = document.getElementById('studentPageContent');
    target.innerHTML = '<div class="student-empty">جاري تحميل الحساب...</div>';

    try {
      const data = await api('/api/student/profile');
      profileCache = data;

      target.innerHTML = `
        <section class="student-profile-grid">
          <article class="student-profile-card">
            <div class="student-profile-avatar">${esc((data.user.name || 'ST').slice(0,2).toUpperCase())}</div>
            <h2>${esc(data.user.name)}</h2>
            <p>${esc(data.user.email)}</p>
            <div class="student-meta" style="margin-top:14px">
              <span>طالب</span>
              <span>${esc(data.academy.name)}</span>
              <span>${esc(data.academy.code)}</span>
            </div>
          </article>

          <article class="student-card">
            <div class="student-card-head"><div><h2>بياناتي</h2><p>يمكنك تعديل الاسم ورقم الهاتف.</p></div></div>
            <form id="studentProfileForm">
              <div class="field"><label>الاسم</label><input name="name" value="${esc(data.user.name || '')}" required></div>
              <div class="field"><label>البريد الإلكتروني</label><input value="${esc(data.user.email || '')}" disabled></div>
              <div class="field"><label>رقم الهاتف</label><input name="phone" value="${esc(data.user.phone || '')}"></div>
              <div class="student-form-message" id="profileMsg"></div>
              <button class="btn primary" type="submit">حفظ البيانات</button>
            </form>
          </article>
        </section>

        <section class="student-card student-section">
          <div class="student-card-head">
            <div><h2>أمان الحساب</h2><p>غيّر كلمة المرور الحالية بكلمة جديدة لا تقل عن 10 أحرف.</p></div>
            <button class="btn secondary" id="changePasswordButton" type="button">تغيير كلمة المرور</button>
          </div>
        </section>
      `;

      document.getElementById('studentProfileForm').onsubmit = async e => {
        e.preventDefault();
        const form = e.currentTarget;
        const btn = form.querySelector('button[type="submit"]');
        const msg = document.getElementById('profileMsg');
        const original = btn.textContent;

        btn.disabled = true;
        btn.textContent = 'جاري الحفظ...';
        msg.textContent = '';

        try {
          const saved = await api('/api/student/profile',{
            method:'PATCH',
            body:JSON.stringify(Object.fromEntries(new FormData(form).entries()))
          });

          user.name = saved.name;
          localStorage.setItem('af_user',JSON.stringify(user));
          msg.style.color = 'var(--success)';
          msg.textContent = 'تم حفظ البيانات.';
        } catch (err) {
          msg.style.color = 'var(--danger)';
          msg.textContent = err.message;
        } finally {
          btn.disabled = false;
          btn.textContent = original;
        }
      };

      document.getElementById('changePasswordButton').onclick = openPasswordModal;
    } catch (err) {
      target.innerHTML = '<div class="student-card student-empty">'+esc(err.message)+'</div>';
    }
  }

  function openPasswordModal() {
    openModal({
      title:'تغيير كلمة المرور',
      subtitle:'استخدم كلمة مرور جديدة لا تقل عن 10 أحرف.',
      html:`
        <div class="field"><label>كلمة المرور الحالية</label><input name="currentPassword" type="password" autocomplete="current-password" required></div>
        <div class="field"><label>كلمة المرور الجديدة</label><input name="newPassword" type="password" autocomplete="new-password" minlength="10" required></div>
        <div class="student-form-message"></div>
        <div class="student-actions" style="justify-content:flex-end"><button class="btn primary" type="submit">تغيير كلمة المرور</button></div>
      `,
      onSubmit:async data => {
        await api('/api/student/profile/password',{
          method:'POST',
          body:JSON.stringify(data)
        });
        closeModal();
        alert('تم تغيير كلمة المرور بنجاح.');
      }
    });
  }

  async function init() {
    renderShell();

    if (page === 'quizzes' && window.StudentQuiz) return window.StudentQuiz.renderList();
    if (page === 'quiz' && window.StudentQuiz) return window.StudentQuiz.renderQuizPage();
    if (page === 'dashboard') return renderDashboard();
    if (page === 'courses') return renderCourses();
    if (page === 'course') return renderCourse();
    if (page === 'live') return renderLive();
    if (page === 'assignments') return renderAssignments();
    if (page === 'quizzes') return renderQuizzes();
    if (page === 'payments') return renderPayments();
    if (page === 'certificates') return renderCertificates();
    if (page === 'notifications') return renderNotifications();
    if (page === 'profile') return renderProfile();

    document.getElementById('studentPageContent').innerHTML = '<div class="student-card student-empty">الصفحة غير موجودة.</div>';
  }

  document.addEventListener('DOMContentLoaded',init);

  return { api };
})();