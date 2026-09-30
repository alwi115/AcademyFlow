(() => {
  'use strict';

  if (window.__academyFlowAIInitialized) return;
  window.__academyFlowAIInitialized = true;

  const role = location.pathname.startsWith('/instructor/') ? 'instructor' : 'student';
  const state = {
    open: false,
    busy: false,
    context: null,
    history: []
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });

    let data = {};
    try {
      data = await response.json();
    } catch {}

    if (!response.ok) {
      throw new Error(data.message || 'تعذر إكمال الطلب');
    }

    return data;
  }

  function courseId() {
    return document.getElementById('afAiCourse')?.value || '';
  }

  function setBusy(value, label = '') {
    state.busy = value;
    const send = document.getElementById('afAiSend');
    const status = document.getElementById('afAiStatus');
    const actions = document.querySelectorAll('[data-af-ai-action]');

    if (send) send.disabled = value;
    actions.forEach(button => { button.disabled = value; });
    if (status) status.textContent = value ? (label || 'AcademyFlow AI يفكر...') : '';
  }

  function addMessage(kind, text, options = {}) {
    const list = document.getElementById('afAiMessages');
    if (!list) return;

    const row = el('div', `af-ai-message af-ai-message-${kind}`);
    const bubble = el('div', 'af-ai-bubble');
    bubble.textContent = text;
    row.appendChild(bubble);

    if (options.link) {
      const link = el('a', 'af-ai-inline-link', options.link.label || 'فتح');
      link.href = options.link.href;
      row.appendChild(link);
    }

    list.appendChild(row);
    list.scrollTop = list.scrollHeight;
  }

  function addLocalNotice(text) {
    addMessage('notice', text);
  }

  function renderCourses(courses) {
    const select = document.getElementById('afAiCourse');
    if (!select) return;

    select.innerHTML = '';
    const all = document.createElement('option');
    all.value = '';
    all.textContent = role === 'instructor' ? 'كل دوراتي المتاحة' : 'كل دوراتي';
    select.appendChild(all);

    for (const course of courses || []) {
      const option = document.createElement('option');
      option.value = course.id;
      option.textContent = course.code ? `${course.title} — ${course.code}` : course.title;
      select.appendChild(option);
    }
  }

  async function loadContext() {
    try {
      const context = await api('/api/ai/context');
      state.context = context;
      renderCourses(context.courses);

      const badge = document.getElementById('afAiStateBadge');
      if (badge) {
        badge.textContent = context.enabled ? 'جاهز' : (context.liveData ? 'بيانات النظام' : 'غير مفعّل');
        badge.dataset.enabled = context.enabled ? 'true' : 'false';
      }

      if (!context.enabled) {
        const keyName = context.provider === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY';
        addLocalNotice(context.liveData
          ? `بيانات AcademyFlow المباشرة مربوطة، لكن الشرح والتوليد الذكي يحتاج ${keyName} في متغيرات الاستضافة.`
          : `AcademyFlow AI مركّب في النظام، لكن يحتاج إضافة ${keyName} في متغيرات الاستضافة عشان يبدأ يرد.`);
      } else if (!context.courses?.length) {
        addLocalNotice(role === 'instructor'
          ? 'ما عندك دورات مسندة لك حاليًا عشان يستخدمها المساعد.'
          : 'ما عندك دورات مسجل فيها حاليًا عشان يستخدمها المساعد.');
      }
    } catch (err) {
      addLocalNotice(err.message);
    }
  }

  async function sendChat(prefill = '') {
    if (state.busy) return;

    const input = document.getElementById('afAiInput');
    const message = (prefill || input?.value || '').trim();
    if (!message) return;

    const previousHistory = state.history.slice(-8);
    state.history.push({ role: 'user', content: message });
    addMessage('user', message);
    if (input) input.value = '';

    setBusy(true, 'قاعد أجهز الإجابة...');
    try {
      const result = await api('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          message,
          courseId: courseId(),
          history: previousHistory
        })
      });

      state.history.push({ role: 'assistant', content: result.answer });
      addMessage('assistant', result.answer);
    } catch (err) {
      addMessage('notice', err.message);
    } finally {
      setBusy(false);
    }
  }

  async function summarize() {
    if (state.busy) return;
    const selectedCourse = courseId();

    if (!selectedCourse) {
      addLocalNotice('اختر دورة محددة من فوق أول، وبعدها اضغط «لخّص الدورة».');
      return;
    }

    setBusy(true, 'قاعد ألخّص محتوى الدورة...');
    try {
      const result = await api('/api/ai/summarize', {
        method: 'POST',
        body: JSON.stringify({ courseId: selectedCourse })
      });
      state.history.push({ role: 'assistant', content: result.summary });
      addMessage('assistant', result.summary);
    } catch (err) {
      addMessage('notice', err.message);
    } finally {
      setBusy(false);
    }
  }

  async function createQuizDraft() {
    if (state.busy) return;
    const selectedCourse = courseId();

    if (!selectedCourse) {
      addLocalNotice('اختر دورة محددة أول عشان أقدر أنشئ الاختبار منها.');
      return;
    }

    const count = Number(document.getElementById('afAiQuestionCount')?.value || 5);
    const difficulty = document.getElementById('afAiDifficulty')?.value || 'medium';

    setBusy(true, 'قاعد أنشئ الاختبار وأضيفه كمسودة...');
    try {
      const result = await api('/api/ai/quiz-draft', {
        method: 'POST',
        body: JSON.stringify({
          courseId: selectedCourse,
          count,
          difficulty
        })
      });

      addMessage(
        'assistant',
        `تم إنشاء اختبار «${result.quiz.title}» وإضافة ${result.questionCount} سؤال كمسودة. راجعه وعدّل اللي تريده قبل النشر.`,
        {
          link: {
            label: 'فتح مسودة الاختبار',
            href: `/instructor/quiz-builder.html?id=${encodeURIComponent(result.quiz.id)}`
          }
        }
      );
    } catch (err) {
      addMessage('notice', err.message);
    } finally {
      setBusy(false);
    }
  }

  function buildWidget() {
    const root = el('div', 'af-ai-root');
    root.id = 'afAiRoot';

    const launcher = el('button', 'af-ai-launcher');
    launcher.type = 'button';
    launcher.setAttribute('aria-label', 'فتح AcademyFlow AI');
    launcher.innerHTML = '<span class="af-ai-launcher-mark">AI</span><span>المساعد الذكي</span>';

    const panel = el('section', 'af-ai-panel');
    panel.setAttribute('aria-label', 'AcademyFlow AI');
    panel.innerHTML = `
      <div class="af-ai-head">
        <div class="af-ai-brand">
          <span class="af-ai-logo">AI</span>
          <div><strong>AcademyFlow AI</strong><small>${role === 'instructor' ? 'مساعد المدرب' : 'مساعد الطالب'}</small></div>
        </div>
        <div class="af-ai-head-actions">
          <span class="af-ai-state" id="afAiStateBadge">يتحقق...</span>
          <button class="af-ai-icon-btn" id="afAiClose" type="button" aria-label="إغلاق">×</button>
        </div>
      </div>

      <div class="af-ai-controls">
        <label class="af-ai-label" for="afAiCourse">الدورة</label>
        <select id="afAiCourse" class="af-ai-select"><option value="">جاري التحميل...</option></select>
      </div>

      <div class="af-ai-quick-actions">
        <button type="button" data-af-ai-action="summary">لخّص الدورة</button>
        ${role === 'student'
          ? '<button type="button" data-af-ai-action="progress">تقدمي</button><button type="button" data-af-ai-action="next-session">موعدي الجاي</button><button type="button" data-af-ai-action="explain">اشرحها ببساطة</button><button type="button" data-af-ai-action="review">سوّ لي مراجعة</button>'
          : '<button type="button" data-af-ai-action="attendance">ملخص الحضور</button><button type="button" data-af-ai-action="followup">متابعة الطلاب</button><button type="button" data-af-ai-action="ideas">أفكار شرح</button>'}
      </div>

      ${role === 'instructor' ? `
        <div class="af-ai-quiz-tools">
          <div><span>اختبار ذكي</span><small>ينضاف مباشرة كمسودة</small></div>
          <select id="afAiQuestionCount" aria-label="عدد الأسئلة">
            <option value="5">5 أسئلة</option>
            <option value="10">10 أسئلة</option>
            <option value="15">15 سؤال</option>
          </select>
          <select id="afAiDifficulty" aria-label="مستوى الصعوبة">
            <option value="easy">سهل</option>
            <option value="medium" selected>متوسط</option>
            <option value="hard">صعب</option>
            <option value="mixed">متنوع</option>
          </select>
          <button type="button" class="af-ai-create-quiz" data-af-ai-action="quiz">أنشئ المسودة</button>
        </div>
      ` : ''}

      <div class="af-ai-messages" id="afAiMessages" aria-live="polite"></div>
      <div class="af-ai-status" id="afAiStatus"></div>

      <form class="af-ai-composer" id="afAiForm">
        <textarea id="afAiInput" maxlength="2400" rows="2" placeholder="${role === 'instructor' ? 'مثال: كيف أشرح هذا الدرس بطريقة أسهل؟' : 'اسأل عن درسك أو اطلب شرح نقطة معينة...'}"></textarea>
        <button id="afAiSend" type="submit">إرسال</button>
      </form>
      <div class="af-ai-foot">الإجابات الذكية قد تخطئ؛ راجع المحتوى المهم قبل الاعتماد عليه.</div>
    `;

    root.appendChild(launcher);
    root.appendChild(panel);
    document.body.appendChild(root);

    addMessage(
      'assistant',
      role === 'instructor'
        ? 'هلا، أنا مساعد AcademyFlow. صرت أقرأ بيانات دوراتك المباشرة مثل أعداد الطلاب، التقدم، الحضور والجلسات القادمة، وبنفس الوقت أقدر أساعدك في الشرح والاختبارات.'
        : 'هلا، أنا مساعد AcademyFlow. صرت أعرف تقدمك، حضورك والجلسات القادمة من بيانات النظام، وأقدر بعد ألخّص لك الدروس وأشرحها بطريقة أبسط.'
    );

    launcher.addEventListener('click', () => {
      state.open = !state.open;
      root.classList.toggle('open', state.open);
      if (state.open) setTimeout(() => document.getElementById('afAiInput')?.focus(), 80);
    });

    document.getElementById('afAiClose')?.addEventListener('click', () => {
      state.open = false;
      root.classList.remove('open');
    });

    document.getElementById('afAiForm')?.addEventListener('submit', event => {
      event.preventDefault();
      sendChat();
    });

    document.getElementById('afAiInput')?.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendChat();
      }
    });

    root.querySelector('[data-af-ai-action="summary"]')?.addEventListener('click', summarize);
    root.querySelector('[data-af-ai-action="progress"]')?.addEventListener('click', () => {
      sendChat('كم نسبة تقدمي في الدورة المحددة؟ لخص لي وضعي الحالي من بيانات AcademyFlow.');
    });
    root.querySelector('[data-af-ai-action="next-session"]')?.addEventListener('click', () => {
      sendChat('متى الجلسة أو الحصة الجاية لي؟ استخدم الموعد الموجود في AcademyFlow.');
    });
    root.querySelector('[data-af-ai-action="attendance"]')?.addEventListener('click', () => {
      sendChat('عطني ملخص الحضور والغياب والتأخر للدورة المحددة من بيانات AcademyFlow.');
    });
    root.querySelector('[data-af-ai-action="followup"]')?.addEventListener('click', () => {
      sendChat('حلل لي وضع الطلاب في الدورة المحددة من ناحية عدد الطلاب ومتوسط التقدم والحضور، وقل لي وين يحتاجون متابعة بدون اختراع بيانات.');
    });
    root.querySelector('[data-af-ai-action="explain"]')?.addEventListener('click', () => {
      sendChat('اشرح لي محتوى الدورة المحددة بطريقة مبسطة، ثم أعطني مثالًا يساعدني أفهمها.');
    });
    root.querySelector('[data-af-ai-action="review"]')?.addEventListener('click', () => {
      sendChat('سوّ لي مراجعة سريعة للدورة المحددة: أهم النقاط ثم 5 أسئلة أختبر نفسي فيها بدون ما تعطيني الإجابات مباشرة.');
    });
    root.querySelector('[data-af-ai-action="ideas"]')?.addEventListener('click', () => {
      sendChat('عطني أفكار عملية ومختصرة لشرح محتوى الدورة المحددة للطلاب بشكل أوضح وأكثر تفاعلًا.');
    });
    root.querySelector('[data-af-ai-action="quiz"]')?.addEventListener('click', createQuizDraft);
  }

  function init() {
    buildWidget();
    loadContext();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
