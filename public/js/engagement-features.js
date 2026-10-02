(() => {
  'use strict';
  if (window.__academyFlowEngagementInitialized) return;
  window.__academyFlowEngagementInitialized = true;

  let user = null;
  try { user = JSON.parse(localStorage.getItem('af_user') || 'null'); } catch {}
  if (!user?.role || user.role === 'superadmin') return;

  const path = location.pathname;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }

  function fmtDate(value, academyDisplay = '') {
    if (academyDisplay) return academyDisplay;
    if (!value) return '—';
    try {
      return new Intl.DateTimeFormat('ar-OM', {
        dateStyle:'medium',
        timeStyle:'short'
      }).format(new Date(value));
    } catch { return String(value); }
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials:'same-origin',
      cache:'no-store',
      headers:{
        'Content-Type':'application/json',
        'Accept':'application/json',
        ...(options.headers || {})
      },
      ...options
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.message || 'تعذر إكمال الطلب');
    return data;
  }

  function target() {
    const dynamic =
      document.getElementById('pageContent') ||
      document.getElementById('studentPageContent');

    if (dynamic) return dynamic;

    return document.querySelector('.main-content')
      || document.querySelector('main')
      || document.body;
  }

  function mount(id, html) {
    if (document.getElementById(id)) return document.getElementById(id);
    const wrap = document.createElement('section');
    wrap.className = 'eng-suite';
    wrap.id = id;
    wrap.innerHTML = html;
    target().appendChild(wrap);
    return wrap;
  }

  function toast(message) {
    const old = document.querySelector('.eng-toast');
    if (old) old.remove();
    const node = document.createElement('div');
    node.className = 'eng-toast';
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 2600);
  }

  function gapMarkup(rows, student = false) {
    if (!rows?.length) {
      return '<div class="eng-empty">ما ظهرت فجوات واضحة من الاختبارات المرتبطة بالدروس حتى الآن.</div>';
    }
    return rows.slice(0, 8).map(row => `
      <div class="eng-map-row">
        <div>
          <b>${student ? 'راجع ' : ''}الدرس ${esc(row.lesson.order)}: ${esc(row.lesson.title)}</b>
          <small>${esc(row.lesson.course?.title || '')} · ${esc(row.wrong)} تعثر من ${esc(row.answered)} إجابة محسوبة</small>
        </div>
        <div class="eng-map-rate">${esc(row.errorRate)}%</div>
      </div>
    `).join('');
  }

  async function renderSettings() {
    if (!['owner','admin'].includes(user.role)) return;
    const data = await api('/api/engagement/settings');
    const root = mount('engSettings', `
      <div class="eng-suite-card">
        <div class="eng-suite-head">
          <div>
            <span class="eng-kicker">ميزات التعلم الذكية</span>
            <h2 style="margin-top:8px">التعويض وخريطة الفجوات</h2>
            <p>تقدر توقف أو تشغل الميزتين بدون التأثير على الحضور والاختبارات الأساسية.</p>
          </div>
        </div>
        <div class="eng-grid">
          <div class="eng-setting">
            <div><b>حزمة التعويض للحصص الفائتة</b><small>ينشئ مراجعة واختباراً قصيراً للطالب الغائب، ويحوّل الحضور إلى «معوّض» بعد النجاح.</small></div>
            <label class="eng-switch"><input id="engCompensationToggle" type="checkbox" ${data.compensationEnabled ? 'checked' : ''}><span></span></label>
          </div>
          <div class="eng-setting">
            <div><b>خريطة فجوات التعلم</b><small>يربط أسئلة الاختبارات بالدروس ويظهر للطالب والمدرس الدروس التي تحتاج مراجعة.</small></div>
            <label class="eng-switch"><input id="engGapToggle" type="checkbox" ${data.gapMapEnabled ? 'checked' : ''}><span></span></label>
          </div>
        </div>
        <div class="eng-actions"><button class="eng-btn primary" id="engSaveSettings" type="button">حفظ إعدادات الميزات</button></div>
      </div>
    `);
    root.querySelector('#engSaveSettings').onclick = async event => {
      const btn = event.currentTarget;
      btn.disabled = true;
      try {
        await api('/api/engagement/settings', {
          method:'PATCH',
          body:JSON.stringify({
            compensationEnabled: root.querySelector('#engCompensationToggle').checked,
            gapMapEnabled: root.querySelector('#engGapToggle').checked
          })
        });
        toast('تم حفظ إعدادات الميزات');
      } catch (err) {
        toast(err.message);
      } finally { btn.disabled = false; }
    };
  }

  function compensationMarkup(rows, enabled) {
    if (!enabled) return '';
    return `
      <div class="eng-suite-card">
        <div class="eng-suite-head">
          <div><span class="eng-kicker">حصة فاتتك؟</span><h2 style="margin-top:8px">حزم التعويض</h2><p>اجتز الاختبار القصير حتى تتغير حالة غياب الحصة إلى «معوّض».</p></div>
        </div>
        ${rows?.length ? '<div class="eng-grid">'+rows.map(row => `
          <article class="eng-item" data-comp-id="${esc(row.id)}">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
              <div><h3>${esc(row.title)}</h3><p>${esc(row.course?.title || '')} · ${fmtDate(row.sessionStartAt, row.sessionStartAtDisplay)}</p></div>
              <span class="eng-pill ${row.status === 'completed' ? 'good' : 'warn'}">${row.status === 'completed' ? 'معوّض' : 'بانتظار التعويض'}</span>
            </div>
            <p style="margin-top:10px">${esc(row.summary)}</p>
            <ul class="eng-points">${(row.keyPoints || []).map(point => '<li>'+esc(point)+'</li>').join('')}</ul>
            <div class="eng-meta"><span>النجاح: ${esc(row.passingPercentage)}%</span><span>أفضل نتيجة: ${esc(row.bestPercentage)}%</span><span>المحاولات: ${esc(row.attempts)}</span></div>
            ${row.status !== 'completed' ? `
              <details class="eng-quiz">
                <summary style="cursor:pointer;font-weight:800">ابدأ اختبار التعويض</summary>
                <form class="eng-comp-form" data-progress-id="${esc(row.id)}">
                  ${(row.quiz || []).map((question, qi) => `
                    <div class="eng-question">
                      <b>${qi + 1}. ${esc(question.prompt)}</b>
                      ${question.options.map((option, oi) => `
                        <label class="eng-option"><input type="radio" name="q_${esc(question.id)}" value="${oi}"> <span>${esc(option)}</span></label>
                      `).join('')}
                    </div>
                  `).join('')}
                  <div class="eng-actions"><button class="eng-btn primary" type="submit">تسليم اختبار التعويض</button></div>
                </form>
              </details>
            ` : '<div class="eng-actions"><span class="eng-pill good">تم اجتياز الحزمة وتسجيل الحضور معوّضاً</span></div>'}
          </article>
        `).join('')+'</div>' : '<div class="eng-empty">ما عندك حصص غياب تحتاج تعويض حالياً.</div>'}
      </div>
    `;
  }

  function feedbackMarkup(rows) {
    if (!rows?.length) return '';
    return `
      <div class="eng-suite-card">
        <div class="eng-suite-head"><div><span class="eng-kicker">بعد الحصة</span><h2 style="margin-top:8px">تقييم الحصة بلمسة</h2><p>اختيار واحد يساعد المدرس يعرف وش يحتاج إعادة شرح.</p></div></div>
        <div class="eng-grid">
          ${rows.map(row => `
            <form class="eng-item eng-feedback-form" data-session-id="${esc(row.id)}">
              <h3>${esc(row.title)}</h3><p>${esc(row.course?.title || '')} · ${fmtDate(row.startAt, row.startAtDisplay)}</p>
              <input type="hidden" name="rating">
              <div class="eng-feedback-buttons">
                <button class="eng-face" type="button" data-rating="understood"><strong>🙂</strong>فهمت</button>
                <button class="eng-face" type="button" data-rating="partial"><strong>😐</strong>جزئياً</button>
                <button class="eng-face" type="button" data-rating="lost"><strong>😵</strong>ضايع</button>
              </div>
              <input class="eng-input" name="hardestPoint" maxlength="1200" placeholder="أصعب نقطة؟ (اختياري)">
              <div class="eng-actions"><button class="eng-btn primary" type="submit">إرسال التقييم</button></div>
            </form>
          `).join('')}
        </div>
      </div>
    `;
  }

  async function renderStudent() {
    const data = await api('/api/engagement/student/overview');
    const root = mount('engStudentSuite', `
      ${compensationMarkup(data.compensations, data.settings?.compensationEnabled)}
      ${data.settings?.gapMapEnabled ? `
        <div class="eng-suite-card" style="margin-top:14px">
          <div class="eng-suite-head"><div><span class="eng-kicker">خريطة الفجوات</span><h2 style="margin-top:8px">وش تحتاج تراجع؟</h2><p>مبنية على إجابات اختباراتك المرتبطة بالدروس.</p></div></div>
          ${gapMarkup(data.gaps, true)}
        </div>
      ` : ''}
      <div style="margin-top:14px">${feedbackMarkup(data.feedbackSessions)}</div>
    `);

    root.querySelectorAll('.eng-comp-form').forEach(form => {
      form.onsubmit = async event => {
        event.preventDefault();
        const answers = [];
        form.querySelectorAll('.eng-question').forEach(questionNode => {
          const checked = questionNode.querySelector('input[type="radio"]:checked');
          const any = questionNode.querySelector('input[type="radio"]');
          if (any && checked) {
            answers.push({
              questionId: any.name.replace(/^q_/, ''),
              optionIndex: Number(checked.value)
            });
          }
        });
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
          const result = await api('/api/engagement/student/compensations/'+encodeURIComponent(form.dataset.progressId)+'/submit', {
            method:'POST',
            body:JSON.stringify({ answers })
          });
          toast(result.passed ? 'نجحت! تم تسجيل الحضور «معوّض».' : 'النتيجة '+result.percentage+'%، تقدر تعيد المحاولة.');
          if (result.passed) {
            root.remove();
            await renderStudent();
          }
        } catch (err) { toast(err.message); }
        finally { button.disabled = false; }
      };
    });

    root.querySelectorAll('.eng-feedback-form').forEach(form => {
      form.querySelectorAll('.eng-face').forEach(button => {
        button.onclick = () => {
          form.querySelectorAll('.eng-face').forEach(x => x.classList.remove('selected'));
          button.classList.add('selected');
          form.elements.rating.value = button.dataset.rating;
        };
      });
      form.onsubmit = async event => {
        event.preventDefault();
        const rating = form.elements.rating.value;
        if (!rating) return toast('اختر وجه التقييم أول');
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
          await api('/api/engagement/student/session-feedback', {
            method:'POST',
            body:JSON.stringify({
              liveSessionId: form.dataset.sessionId,
              rating,
              hardestPoint: form.elements.hardestPoint.value
            })
          });
          toast('وصل تقييمك للمدرس');
          form.remove();
        } catch (err) { toast(err.message); }
        finally { button.disabled = false; }
      };
    });
  }

  async function renderInstructor() {
    const data = await api('/api/engagement/instructor/insights');
    mount('engInstructorSuite', `
      <div class="eng-suite-card">
        <div class="eng-suite-head"><div><span class="eng-kicker">نبض الحصص</span><h2 style="margin-top:8px">كيف فهم الطلاب آخر الحصص؟</h2><p>ملخص فوري من تقييمات الطلاب بعد الحصة.</p></div></div>
        ${data.feedback?.length ? '<div class="eng-grid">'+data.feedback.map(row => `
          <article class="eng-item">
            <h3>${esc(row.session.title)}</h3><p>${esc(row.session.course?.title || '')} · ${fmtDate(row.session.startAt, row.session.startAtDisplay)}</p>
            <div class="eng-meta"><span>🙂 فهمت: ${row.understood}</span><span>😐 جزئياً: ${row.partial}</span><span>😵 ضايع: ${row.lost}</span><span>الردود: ${row.total}</span></div>
            ${row.hardestPoints?.length ? '<ul class="eng-points">'+row.hardestPoints.map(x => '<li>'+esc(x)+'</li>').join('')+'</ul>' : '<div class="eng-empty">ما انكتبت نقاط صعبة لهذه الحصة.</div>'}
          </article>
        `).join('')+'</div>' : '<div class="eng-empty">ما وصلت تقييمات حصص حتى الآن.</div>'}
      </div>
      ${data.settings?.gapMapEnabled ? `
        <div class="eng-suite-card" style="margin-top:14px">
          <div class="eng-suite-head"><div><span class="eng-kicker">خريطة الفجوات</span><h2 style="margin-top:8px">الدروس الأكثر تعثراً</h2><p>تجميع من آخر محاولة مكتملة لكل طالب في كل اختبار.</p></div></div>
          ${gapMarkup(data.gaps, false)}
        </div>
      ` : ''}
    `);
  }

  function riskLabel(level) {
    return level === 'high' ? ['مرتفع','bad'] : level === 'medium' ? ['متوسط','warn'] : ['منخفض','good'];
  }

  async function renderRisk() {
    const rows = await api('/api/engagement/academy/withdrawal-risk');
    mount('engRiskSuite', `
      <div class="eng-suite-card">
        <div class="eng-suite-head">
          <div><span class="eng-kicker">المتابعة الذكية</span><h2 style="margin-top:8px">خطر الانسحاب + رسالة جاهزة</h2><p>الدرجة تجمع الغياب خلال 60 يوماً، الواجبات المتأخرة، والدفعات المعلقة منذ أكثر من 7 أيام.</p></div>
          <span class="eng-pill">${rows.length} طالب</span>
        </div>
        <div class="eng-table-wrap"><table class="eng-table">
          <thead><tr><th>الطالب</th><th>الخطر</th><th>المؤشرات</th><th>المتابعة</th></tr></thead>
          <tbody>
            ${rows.length ? rows.slice(0,100).map((row,index) => {
              const label = riskLabel(row.level);
              return `<tr>
                <td><b>${esc(row.student.name)}</b><br><small>${esc(row.student.email || '')}</small></td>
                <td><span class="eng-pill ${label[1]}">${label[0]}</span><div class="eng-risk-score">${row.score}/100</div></td>
                <td>${row.reasons.map(x => '<div>• '+esc(x)+'</div>').join('')}</td>
                <td><div class="eng-actions">
                  ${row.whatsappUrl ? '<a class="eng-btn primary" target="_blank" rel="noopener" href="'+esc(row.whatsappUrl)+'">فتح واتساب</a>' : '<span class="eng-pill warn">لا يوجد رقم هاتف</span>'}
                  <button class="eng-btn eng-copy-risk" type="button" data-index="${index}">نسخ الرسالة</button>
                </div></td>
              </tr>`;
            }).join('') : '<tr><td colspan="4" class="eng-empty">لا يوجد طلاب نشطون حالياً.</td></tr>'}
          </tbody>
        </table></div>
      </div>
    `);
    document.querySelectorAll('.eng-copy-risk').forEach(btn => {
      btn.onclick = async () => {
        const row = rows[Number(btn.dataset.index)];
        try {
          await navigator.clipboard.writeText(row.whatsappMessage);
          toast('تم نسخ رسالة المتابعة');
        } catch { toast('تعذر النسخ التلقائي'); }
      };
    });
  }

  async function renderQuizMapping() {
    if (!['owner','admin','content_manager','instructor'].includes(user.role)) return;
    const quizId = new URLSearchParams(location.search).get('id');
    if (!quizId) return;

    document.getElementById('engQuizMapping')?.remove();
    const data = await api('/api/engagement/quizzes/'+encodeURIComponent(quizId)+'/mapping');
    const root = mount('engQuizMapping', `
      <div class="eng-suite-card">
        <div class="eng-suite-head">
          <div><span class="eng-kicker">خريطة الفجوات</span><h2 style="margin-top:8px">اربط كل سؤال بالدرس</h2><p>هذا الربط هو اللي يخلي توصية «راجع الدرس 3 و5» دقيقة.</p></div>
          <span class="eng-pill ${data.enabled ? 'good' : 'warn'}">${data.enabled ? 'مفعّلة' : 'متوقفة من الإعدادات'}</span>
        </div>
        ${!data.enabled ? '<div class="eng-empty">فعّل خريطة الفجوات من إعدادات الأكاديمية أولاً.</div>' :
          data.questions.length ? '<div class="eng-grid">'+data.questions.map(question => `
            <div class="eng-item">
              <h3>سؤال ${esc(question.order)}</h3>
              <p>${esc(question.prompt)}</p>
              <select class="eng-select eng-question-lesson" data-question-id="${esc(question.id)}" style="margin-top:10px">
                <option value="">اختر الدرس المرتبط...</option>
                ${data.lessons.map(lesson => '<option value="'+esc(lesson.id)+'" '+(question.lessonId === lesson.id ? 'selected' : '')+'>الدرس '+esc(lesson.order)+': '+esc(lesson.title)+'</option>').join('')}
              </select>
            </div>
          `).join('')+'</div>' : '<div class="eng-empty">أضف أسئلة للاختبار أولاً.</div>'}
      </div>
    `);

    root.querySelectorAll('.eng-question-lesson').forEach(select => {
      select.onchange = async () => {
        if (!select.value) return toast('اختر درساً للسؤال');
        select.disabled = true;
        try {
          await api('/api/engagement/quizzes/'+encodeURIComponent(quizId)+'/questions/'+encodeURIComponent(select.dataset.questionId)+'/lesson', {
            method:'PATCH',
            body:JSON.stringify({ lessonId: select.value })
          });
          toast('تم ربط السؤال بالدرس');
        } catch (err) { toast(err.message); }
        finally { select.disabled = false; }
      };
    });
  }

  async function init() {
    try {
      if (path === '/academy/settings.html') await renderSettings();
      if (path === '/academy/dashboard.html' && ['owner','admin'].includes(user.role)) await renderRisk();
      if (path === '/instructor/dashboard.html' && user.role === 'instructor') await renderInstructor();
      if ((path === '/student/dashboard.html' || path === '/student/live.html') && user.role === 'student') await renderStudent();
      if (path.endsWith('/quiz-builder.html')) await renderQuizMapping();
    } catch (err) {
      console.error('[engagement-suite]', err);
    }
  }

  if (path.endsWith('/quiz-builder.html')) {
    document.addEventListener('academyflow:quiz-builder-rendered', () => {
      renderQuizMapping().catch(err => console.error('[engagement-suite]', err));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 450), { once:true });
  } else {
    setTimeout(init, 450);
  }
})();
