/* Shared learning views, using the existing portal authentication and API client. */
window.AFLearning = (() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const types = { live: 'محاضرة', assignment: 'واجب', quiz: 'اختبار' };
  const dayKey = (value, zone) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
  const dateText = (value, zone) => new Intl.DateTimeFormat('ar', { timeZone: zone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  const empty = text => `<div class="learning-empty">${esc(text)}</div>`;
  const courseOptions = rows => '<option value="">كل الدورات</option>' + rows.map(row => `<option value="${esc(row.id)}">${esc(row.title)}</option>`).join('');
  function error(target, err, retry) {
    target.innerHTML = `<div class="learning-empty" role="alert"><p>${esc(err.message || 'تعذر تحميل البيانات.')}</p><button class="btn secondary" type="button">إعادة المحاولة</button></div>`;
    target.querySelector('button').onclick = retry;
  }
  function stats(items) {
    return `<div class="learning-stats">${items.map(([value, label]) => `<div class="learning-stat"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`).join('')}</div>`;
  }
  function ics(events, origin, now = new Date()) {
    const stamp = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const text = value => String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n|\r/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AcademyFlow//Learning calendar//AR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    for (const row of events) {
      lines.push('BEGIN:VEVENT', `UID:${row.id}@academyflow`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(row.at)}`,
        `DTEND:${stamp(row.endAt || new Date(+new Date(row.at) + 60000))}`, `SUMMARY:${text(types[row.type] + ': ' + row.title)}`,
        `DESCRIPTION:${text(row.course + ' — ' + (row.phase === 'open' ? 'بداية الاختبار' : row.phase === 'due' ? 'آخر موعد للتسليم' : 'المحاضرة'))}`,
        `URL:${origin}${row.href}`);
      if (new Date(row.at) > now && row.status !== 'closed' && row.status !== 'ended') lines.push('BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', `DESCRIPTION:${text(row.title)}`, 'END:VALARM');
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    // RFC 5545 limits physical lines to 75 octets, including continuation spaces.
    return lines.map(line => {
      let output = '', size = 0;
      for (const char of line) {
        const bytes = new TextEncoder().encode(char).length;
        if (size + bytes > 75) { output += '\r\n '; size = 1; }
        output += char; size += bytes;
      }
      return output;
    }).join('\r\n') + '\r\n';
  }

  async function calendar({ api, portal, target }) {
    let month = null, selected = null, zone = 'UTC', data, requestId = 0;
    target.innerHTML = `<section class="learning-panel"><div class="learning-toolbar"><div><span class="learning-kicker">خطّط لأسبوعك</span><h2>كل مواعيدك في مكان واحد</h2><p>المحاضرات، بداية الاختبارات، ومواعيد التسليم.</p></div><button type="button" class="btn secondary" id="learningExport" disabled>إضافة إلى تقويم الجهاز</button></div>
      <div class="learning-filters"><label>الدورة<select id="learningCourse"><option value="">كل الدورات</option></select></label><label>نوع الموعد<select id="learningType"><option value="">كل المواعيد</option><option value="live">المحاضرات</option><option value="assignment">الواجبات</option><option value="quiz">الاختبارات</option></select></label><span id="learningZone" class="learning-muted"></span></div>
      <p class="learning-note">ملف تقويم الجهاز يتضمن تذكيرًا قبل الموعد بـ30 دقيقة بعد استيراده وتفعيل التنبيهات في تطبيق التقويم. أعد تصديره عند تغيّر المواعيد.</p></section>
      <div id="learningReminder" aria-live="polite"></div><section class="learning-panel"><div class="learning-toolbar"><h2 id="learningMonth"></h2><div class="learning-actions"><button class="btn secondary" id="learningPrev" type="button" aria-label="الشهر السابق">السابق</button><button class="btn soft" id="learningToday" type="button">اليوم</button><button class="btn secondary" id="learningNext" type="button" aria-label="الشهر التالي">التالي</button></div></div>
      <div id="learningCalendarState" role="status" aria-live="polite"></div><div class="learning-calendar-layout"><div id="learningGrid" class="learning-grid" aria-label="أيام الشهر"></div><section class="learning-agenda"><h3 id="learningDay"></h3><div id="learningEvents" aria-live="polite"></div></section></div></section>`;
    const get = name => target.querySelector('#learning' + name);
    function filtered() { return (data?.events || []).filter(row => !get('Type').value || row.type === get('Type').value); }
    function eventCard(row) {
      const phase = row.phase === 'open' ? 'بداية الاختبار' : row.phase === 'due' ? 'آخر موعد للتسليم' : types[row.type];
      return `<article class="learning-event"><span class="learning-tag ${esc(row.type)}">${esc(phase)}</span><h4>${esc(row.title)}</h4><p>${esc(row.course)}</p><time datetime="${esc(row.at)}">${esc(dateText(row.at, zone))}</time><a href="${esc(row.href)}">${portal === 'student' ? 'فتح' : 'إدارة'} ${esc(types[row.type])} ←</a></article>`;
    }
    function paint() {
      const rows = filtered(), today = dayKey(data.generatedAt, zone);
      get('Month').textContent = new Intl.DateTimeFormat('ar', { calendar: 'gregory', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(month);
      const start = new Date(+month - month.getUTCDay() * 86400000);
      let html = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'].map(day => `<span class="learning-weekday">${day}</span>`).join('');
      for (let n = 0; n < 42; n++) {
        const date = new Date(+start + n * 86400000), key = date.toISOString().slice(0, 10);
        const dayRows = rows.filter(row => dayKey(row.at, zone) === key);
        html += `<button type="button" class="learning-day ${date.getUTCMonth() !== month.getUTCMonth() ? 'outside' : ''} ${key === today ? 'today' : ''}" data-day="${key}" aria-pressed="${key === selected}" aria-label="${key}، ${dayRows.length} مواعيد" ${key === today ? 'aria-current="date"' : ''}><b>${date.getUTCDate()}</b><span>${dayRows.length ? dayRows.length + ' مواعيد' : ''}</span><small>${dayRows.slice(0, 2).map(row => esc(types[row.type])).join(' · ')}</small></button>`;
      }
      get('Grid').innerHTML = html;
      get('Grid').querySelectorAll('[data-day]').forEach(button => { button.onclick = () => { selected = button.dataset.day; paint(); get('Grid').querySelector(`[data-day="${selected}"]`).focus(); }; });
      get('Day').textContent = new Intl.DateTimeFormat('ar', { calendar: 'gregory', dateStyle: 'full', timeZone: 'UTC' }).format(new Date(selected + 'T12:00:00Z'));
      get('Events').innerHTML = rows.filter(row => dayKey(row.at, zone) === selected).map(eventCard).join('') || empty('لا توجد مواعيد في هذا اليوم.');
      const upcoming = rows.filter(row => new Date(row.at) >= new Date(data.generatedAt) && new Date(row.at) - new Date(data.generatedAt) <= 86400000 && !['closed', 'ended'].includes(row.status));
      get('Reminder').innerHTML = upcoming.length ? `<section class="learning-panel learning-reminder"><h3>خلال الـ24 ساعة القادمة · ${upcoming.length}</h3><div class="learning-event-list">${upcoming.slice(0, 4).map(eventCard).join('')}</div>${upcoming.length > 4 ? '<p>باقي المواعيد موضحة في التقويم.</p>' : ''}</section>` : '';
      get('Export').disabled = !rows.length;
    }
    async function load(initial = false) {
      const ticket = ++requestId;
      data = null;
      get('CalendarState').textContent = 'جاري تحميل المواعيد…';
      get('Grid').innerHTML = ''; get('Events').innerHTML = ''; get('Reminder').innerHTML = ''; get('Export').disabled = true;
      ['Prev', 'Next', 'Today', 'Course', 'Type'].forEach(name => { get(name).disabled = true; });
      try {
        // The initial response provides the academy timezone before selecting its current month.
        if (initial) {
          const config = await api(`/api/${portal}/calendar?meta=1`);
          if (ticket !== requestId) return;
          zone = config.timezone;
          selected = dayKey(config.generatedAt, zone);
          month = new Date(selected.slice(0, 7) + '-01T00:00:00Z');
          get('Course').innerHTML = courseOptions(config.courses);
          get('Zone').textContent = 'توقيت الأكاديمية: ' + zone;
        }
        const start = new Date(+month - (month.getUTCDay() + 1) * 86400000);
        const params = new URLSearchParams({ from: start.toISOString(), to: new Date(+start + 44 * 86400000).toISOString(), courseId: get('Course').value });
        data = await api(`/api/${portal}/calendar?${params}`);
        if (ticket !== requestId) return;
        get('CalendarState').textContent = `${data.events.length} موعدًا في الفترة المعروضة`;
        paint();
      } catch (err) { if (ticket === requestId) error(get('CalendarState'), err, () => load(!month)); }
      finally { if (ticket === requestId) { ['Prev', 'Next', 'Today', 'Course'].forEach(name => { get(name).disabled = !month; }); get('Type').disabled = !data; } }
    }
    get('Prev').onclick = () => { month = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)); selected = month.toISOString().slice(0, 10); load(); };
    get('Next').onclick = () => { month = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)); selected = month.toISOString().slice(0, 10); load(); };
    get('Today').onclick = () => { selected = dayKey(new Date(), zone); month = new Date(selected.slice(0, 7) + '-01T00:00:00Z'); load(); };
    get('Course').onchange = () => load();
    get('Type').onchange = () => { if (data) paint(); };
    get('Export').onclick = () => {
      const url = URL.createObjectURL(new Blob([ics(filtered(), location.origin)], { type: 'text/calendar;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = 'AcademyFlow-calendar.ics'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    await load(true);
  }

  async function progress({ api, target }) {
    target.innerHTML = empty('جاري تحميل مسارك الدراسي…');
    try {
      const data = await api('/api/student/progress');
      const percent = data.total ? Math.round(data.completed / data.total * 100) : 0;
      target.innerHTML = `<section class="learning-panel"><span class="learning-kicker">خطوة اليوم تصنع تقدّم الغد</span><h2>مسارك الدراسي</h2><p>الإنجاز محسوب من الدروس المنشورة حاليًا. إتمام الاختبار يعني إنهاء المحاولة، وليس اجتيازه.</p>${stats([[percent + '%', 'إنجاز الدروس'], [data.completed, 'درس مكتمل'], [data.total - data.completed, 'درس متبقٍ']])}</section>
        <div class="learning-course-grid">${data.courses.map(row => `<article class="learning-panel"><div class="learning-toolbar"><h2>${esc(row.title)}</h2><span class="learning-tag">${({ active: 'نشط', paused: 'متوقف مؤقتًا', completed: 'تسجيل مكتمل' })[row.status] || ''}</span></div>
        <div class="learning-progress-heading"><b>${row.percent}%</b><span>${row.completed} من ${row.total} درسًا</span></div><progress value="${row.completed}" max="${row.total || 1}" aria-label="إنجاز دروس ${esc(row.title)}"></progress>
        <div class="learning-milestones"><span>الواجبات المسلّمة <b>${row.assignments.completed}/${row.assignments.total}</b></span><span>الاختبارات المنتهية <b>${row.quizzes.completed}/${row.quizzes.total}</b></span></div>
        ${row.next ? `<div class="learning-next"><span>خطوتك التالية</span><h3>${esc(row.next.title)}</h3><a class="btn primary" href="${esc(row.next.href)}">متابعة التعلّم ←</a></div>` : empty(row.total ? 'أتممت جميع الدروس المنشورة، أحسنت!' : 'ستظهر خطواتك عند نشر دروس هذه الدورة.')}
        ${row.steps.length ? `<details class="learning-steps"><summary>عرض مسار الدروس (${row.total})</summary><ol>${row.steps.map(step => `<li><span class="learning-step-icon" aria-label="${step.completed ? 'مكتمل' : 'متبقٍ'}">${step.completed ? '✓' : '○'}</span><a href="${esc(step.href)}">${esc(step.title)}</a></li>`).join('')}</ol></details>` : ''}</article>`).join('') || empty('لم تُسجّل في أي دورة بعد. ستجد مسارك هنا بعد التسجيل.')}</div>`;
    } catch (err) { error(target, err, () => progress({ api, target })); }
  }

  async function followUp({ api, portal, target }) {
    let data, page = 1, ticket = 0;
    target.innerHTML = `<section class="learning-panel"><span class="learning-kicker">دعم الطالب في الوقت المناسب</span><h2>طلاب يحتاجون متابعة</h2><p>يظهر التنبيه عند تسجيل يومَي غياب أو تأخر واجبين دون تسليم خلال آخر 30 يومًا، بعد تاريخ التسجيل. تشمل المتابعة التسجيلات النشطة فقط.</p><p class="learning-note">الغياب من سجل الحضور اليدوي؛ غياب السجل لا يُحسب غيابًا. المؤشرات للمراجعة والمتابعة ولا تغيّر درجات الطالب أو حالة تسجيله.</p>
      <div class="learning-filters"><label>الدورة<select id="followCourse"><option value="">كل الدورات</option></select></label><label class="learning-checkbox"><input type="checkbox" id="followAll">عرض التسجيلات دون تنبيه أيضًا</label><button type="button" class="btn secondary" id="followRefresh">تحديث</button></div></section>
      <div id="followState" role="status" aria-live="polite"></div><div id="followRows"></div><div class="learning-toolbar learning-pagination"><button class="btn secondary" id="followPrev" type="button">السابق</button><span id="followPage"></span><button class="btn secondary" id="followNext" type="button">التالي</button></div>`;
    const get = name => target.querySelector('#follow' + name);
    function paint() {
      const rows = data.rows.filter(row => get('All').checked || row.reasons.length);
      const flagged = data.rows.filter(row => row.reasons.length).length;
      get('State').innerHTML = stats([[flagged, 'تسجيلات تحتاج متابعة في هذه الصفحة'], [data.rows.length, 'تسجيلات تمت مراجعتها في هذه الصفحة'], [data.totalEnrollments, 'إجمالي التسجيلات ضمن الفلتر']]);
      get('Rows').innerHTML = rows.map(row => `<article class="learning-panel learning-followup"><div class="learning-toolbar"><div><h3>${esc(row.student.name)}</h3><p>${esc(row.course.title)}</p></div><span class="learning-tag ${row.priority === 'high' ? 'attention' : ''}">${row.priority === 'high' ? 'أولوية متابعة' : row.priority === 'follow_up' ? 'يحتاج متابعة' : 'لا توجد مؤشرات'}</span></div>
        <div class="learning-reasons">${row.reasons.map(reason => `<span>${esc(reason.label)}</span>`).join('') || '<span>لا يتجاوز حدود التنبيه الحالية</span>'}</div><p class="learning-muted">${row.absences} أيام غياب من ${row.recordedDays} أيام مسجّلة · ${row.overdue.length} واجبات دون تسليم</p>
        ${row.overdue.length ? `<details><summary>الواجبات المتأخرة (${row.overdue.length})</summary><ul>${row.overdue.map(task => `<li>${esc(task.title)} — <time datetime="${esc(task.dueAt)}">${esc(dateText(task.dueAt, data.timezone))}</time></li>`).join('')}</ul></details>` : ''}
        <div class="learning-actions"><a class="btn secondary" href="/${portal}/attendance.html">مراجعة الحضور</a><a class="btn secondary" href="/${portal}/assignments.html">مراجعة الواجبات</a></div></article>`).join('') || empty(data.totalEnrollments ? 'لا توجد تنبيهات في هذه الصفحة. استخدم التالي لمراجعة باقي التسجيلات.' : 'لا توجد تسجيلات نشطة ضمن هذا النطاق.');
      get('Page').textContent = `صفحة ${data.page} من ${data.pages} · حتى 50 تسجيلًا لكل صفحة`;
      get('Prev').disabled = page <= 1; get('Next').disabled = page >= data.pages;
    }
    async function load() {
      const current = ++ticket;
      data = null;
      get('State').textContent = 'جاري مراجعة الحضور والتسليمات…'; get('Rows').innerHTML = '';
      ['Prev', 'Next', 'Refresh', 'Course', 'All'].forEach(name => { get(name).disabled = true; });
      try {
        data = await api(`/api/${portal}/follow-up?${new URLSearchParams({ page, courseId: get('Course').value })}`);
        if (current !== ticket) return;
        const value = get('Course').value; get('Course').innerHTML = courseOptions(data.courses); get('Course').value = value;
        paint();
      } catch (err) { if (current === ticket) error(get('State'), err, load); }
      finally { if (current === ticket) { ['Refresh', 'Course'].forEach(name => { get(name).disabled = false; }); get('All').disabled = !data; } }
    }
    get('Course').onchange = () => { page = 1; load(); };
    get('All').onchange = () => { if (data) paint(); };
    get('Refresh').onclick = load;
    get('Prev').onclick = () => { page--; load(); };
    get('Next').onclick = () => { page++; load(); };
    await load();
  }
  return { calendar, progress, followUp, ics };
})();
