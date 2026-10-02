window.AcademyQuizAdmin = (() => {
  function user() {
    try { return JSON.parse(localStorage.getItem('af_user') || 'null'); } catch { return null; }
  }

  function portalPath(file) {
    return document.body.classList.contains('instructor-app')
      ? '/instructor/' + file
      : '/academy/' + file;
  }

  function apiBase() {
    return document.body.classList.contains('instructor-app')
      ? '/api/instructor'
      : '/api/academy';
  }

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

  function localDateTime(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const offset = d.getTimezoneOffset();
    return new Date(d.getTime() - offset * 60000).toISOString().slice(0,16);
  }

  function status(value) {
    const map = {
      draft:['مسودة','warn'],
      published:['منشور','good'],
      closed:['مغلق','bad'],
      in_progress:['جارية','warn'],
      pending_review:['تحتاج تصحيح','warn'],
      graded:['مصححة','good'],
      expired:['انتهى الوقت','bad']
    };
    const item = map[value] || [value || '—','info'];
    return '<span class="academy-status '+item[1]+'">'+esc(item[0])+'</span>';
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

    if (response.status === 401) {
      localStorage.removeItem('af_user');
      location.replace('/academy/login.html');
      throw new Error('انتهت الجلسة');
    }

    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    if (!response.ok) throw new Error(data?.message || 'تعذر تنفيذ العملية');
    return data;
  }

  function toast(message, type='ok') {
    let box = document.getElementById('quizToast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'quizToast';
      box.className = 'quiz-toast';
      document.body.appendChild(box);
    }

    box.textContent = message;
    box.classList.toggle('error',type === 'error');
    box.classList.add('show');
    clearTimeout(box._timer);
    box._timer = setTimeout(() => box.classList.remove('show'),2600);
  }

  function modalElements() {
    return {
      modal:document.getElementById('academyModal'),
      title:document.getElementById('academyModalTitle'),
      subtitle:document.getElementById('academyModalSubtitle'),
      form:document.getElementById('academyModalForm')
    };
  }

  function closeModal() {
    const { modal } = modalElements();
    if (modal) modal.hidden = true;
  }

  async function options() {
    return api(apiBase() + '/options');
  }

  async function openQuizForm(row=null,onDone=async()=>{}) {
    const { modal,title,subtitle,form } = modalElements();
    const opts = await options();

    title.textContent = row ? 'تعديل الاختبار' : 'اختبار جديد';
    subtitle.textContent = row
      ? 'عدّل الإعدادات العامة ثم احفظ.'
      : 'يُنشأ الاختبار كمسودة أولًا، ثم أضف الأسئلة وانشره.';

    form.innerHTML = `
      <div class="field"><label>الدورة</label><select name="courseId" required>
        <option value="">اختر الدورة...</option>
        ${opts.courses.map(c => '<option value="'+esc(c._id)+'" '+(String(row?.courseId?._id || row?.courseId || '')===String(c._id)?'selected':'')+'>'+esc(c.title+(c.code?' · '+c.code:''))+'</option>').join('')}
      </select></div>
      <div class="field"><label>عنوان الاختبار</label><input name="title" value="${esc(row?.title || '')}" required></div>
      <div class="field"><label>متاح من</label><input name="availableFrom" type="datetime-local" value="${esc(row?.availableFromLocal || localDateTime(row?.availableFrom))}"></div>
      <div class="field"><label>آخر موعد</label><input name="dueAt" type="datetime-local" value="${esc(row?.dueAtLocal || localDateTime(row?.dueAt))}"></div>
      <div class="field"><label>المدة بالدقائق <small>0 = بدون مؤقت مستقل</small></label><input name="durationMinutes" type="number" min="0" max="1440" value="${esc(row?.durationMinutes ?? 30)}"></div>
      <div class="field"><label>عدد المحاولات</label><input name="maxAttempts" type="number" min="1" max="100" value="${esc(row?.maxAttempts ?? 1)}"></div>
      <div class="field"><label>نسبة النجاح %</label><input name="passingPercentage" type="number" min="0" max="100" value="${esc(row?.passingPercentage ?? 50)}"></div>
      <div class="field full"><label>وصف / تعليمات</label><textarea name="description">${esc(row?.description || '')}</textarea></div>

      <div class="quiz-switch-grid full">
        ${switchField('shuffleQuestions','ترتيب الأسئلة عشوائي',row ? row.shuffleQuestions : true)}
        ${switchField('shuffleOptions','ترتيب الخيارات عشوائي',row ? row.shuffleOptions : true)}
        ${switchField('showCorrectAnswers','إظهار الإجابات الصحيحة بعد التسليم',Boolean(row?.showCorrectAnswers))}
      </div>

      <div class="academy-form-message" id="quizFormMessage"></div>
      <div class="academy-form-actions">
        <button class="btn ghost" id="quizFormCancel" type="button">إلغاء</button>
        <button class="btn primary" type="submit">${row?'حفظ التعديلات':'إنشاء الاختبار'}</button>
      </div>
    `;

    modal.hidden = false;
    document.getElementById('quizFormCancel').onclick = closeModal;

    form.onsubmit = async e => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const msg = document.getElementById('quizFormMessage');
      const original = btn.textContent;
      const fd = new FormData(form);
      const payload = Object.fromEntries(fd.entries());

      for(const key of ['shuffleQuestions','shuffleOptions','showCorrectAnswers']) {
        payload[key] = form.elements[key].checked;
      }

      for(const key of ['availableFrom','dueAt']) {
        if (!payload[key]) payload[key] = null;
      }

      btn.disabled = true;
      btn.textContent = 'جاري الحفظ...';
      msg.textContent = '';

      try {
        const saved = await api(
          row ? apiBase() + '/quizzes/'+row._id : apiBase() + '/quizzes',
          {method:row?'PATCH':'POST',body:JSON.stringify(payload)}
        );
        closeModal();
        toast(row ? 'تم تحديث الاختبار' : 'تم إنشاء الاختبار');
        await onDone(saved);
      } catch(err) {
        msg.textContent = err.message;
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    };
  }

  function switchField(name,label,checked) {
    return `
      <label class="quiz-switch">
        <input name="${name}" type="checkbox" ${checked?'checked':''}>
        <span><b>${esc(label)}</b><small>${checked?'مفعل افتراضيًا':'يمكن تغييره لاحقًا'}</small></span>
        <i></i>
      </label>
    `;
  }

  async function renderList() {
    const target = document.getElementById('pageContent');
    target.innerHTML = `
      <section class="academy-card">
        <div class="academy-card-head">
          <div><h2>الاختبارات</h2><p>أنشئ الاختبار، أضف الأسئلة، ثم انشره للطلاب.</p></div>
          <div class="academy-filter-row">
            <input class="academy-search" id="quizSearch" placeholder="بحث بالاختبار أو الدورة...">
            <button class="btn primary" id="quizCreate" type="button">+ اختبار جديد</button>
          </div>
        </div>
        <div id="quizList"><div class="academy-empty">جاري تحميل الاختبارات...</div></div>
      </section>
    `;

    let rows=[];

    const draw=()=>{
      const q=(document.getElementById('quizSearch').value||'').trim().toLowerCase();
      const filtered=q?rows.filter(x=>JSON.stringify(x).toLowerCase().includes(q)):rows;
      const box=document.getElementById('quizList');

      box.innerHTML=filtered.length?`
        <div class="quiz-admin-grid">
          ${filtered.map(row=>`
            <article class="quiz-admin-card">
              <div class="quiz-admin-card-head">
                <div>
                  <span class="quiz-course-label">${esc(row.courseId?.title || 'دورة')}</span>
                  <h3>${esc(row.title)}</h3>
                </div>
                ${status(row.status)}
              </div>
              <p>${esc(row.description || 'بدون تعليمات إضافية.')}</p>
              <div class="quiz-admin-stats">
                <span><b>${esc(row.questionCount)}</b> سؤال</span>
                <span><b>${esc(row.totalMarks)}</b> درجة</span>
                ${user()?.role === 'content_manager' ? '' : `
                  <span><b>${esc(row.attemptCount)}</b> محاولة</span>
                  <span><b>${esc(row.pendingReviewCount)}</b> تحتاج تصحيح</span>
                `}
              </div>
              <div class="quiz-admin-meta">
                <span>المدة: ${esc(row.durationMinutes || 0)} د</span>
                <span>المحاولات: ${esc(row.maxAttempts || 1)}</span>
                <span>النجاح: ${esc(row.passingPercentage ?? 50)}%</span>
                <span>الإغلاق: ${esc(row.dueAtDisplay || fmtDate(row.dueAt,true))}</span>
              </div>
              <a class="btn primary" href="${portalPath('quiz-builder.html')}?id=${encodeURIComponent(row._id)}">إدارة الاختبار</a>
            </article>
          `).join('')}
        </div>
      `:'<div class="academy-empty">لا توجد اختبارات حتى الآن.</div>';
    };

    const load=async()=>{
      try{
        rows=await api(apiBase() + '/quizzes');
        draw();
      }catch(err){
        document.getElementById('quizList').innerHTML='<div class="academy-empty">'+esc(err.message)+'</div>';
      }
    };

    document.getElementById('quizSearch').oninput=draw;
    document.getElementById('quizCreate').onclick=()=>openQuizForm(null,async saved=>{
      location.href=portalPath('quiz-builder.html')+'?id='+encodeURIComponent(saved._id);
    });

    await load();
  }

  function questionType(type) {
    return ({
      multiple_choice:'اختيار من متعدد',
      true_false:'صح / خطأ',
      short_answer:'إجابة قصيرة'
    })[type] || type;
  }

  function renderQuestionCorrect(q) {
    if (q.type === 'multiple_choice') {
      const correct=(q.options||[]).find(o=>o.isCorrect);
      return correct?.text || 'غير محدد';
    }
    if (q.type === 'true_false') return q.correctBoolean ? 'صح' : 'خطأ';
    return 'تصحيح يدوي';
  }

  function optionRow(index,value='',correct=false) {
    return `
      <div class="quiz-option-row" data-option-row>
        <input type="radio" name="correctOption" value="${index}" ${correct?'checked':''} aria-label="الإجابة الصحيحة">
        <input class="quiz-option-text" type="text" value="${esc(value)}" placeholder="الخيار ${index+1}">
        <button class="icon-btn quiz-remove-option" type="button" title="حذف الخيار">×</button>
      </div>
    `;
  }

  function bindOptionRows(container) {
    const renumber=()=>{
      [...container.querySelectorAll('[data-option-row]')].forEach((row,index)=>{
        row.querySelector('input[type="radio"]').value=index;
        row.querySelector('.quiz-option-text').placeholder='الخيار '+(index+1);
      });
    };

    container.querySelectorAll('.quiz-remove-option').forEach(btn=>{
      btn.onclick=()=>{
        if(container.querySelectorAll('[data-option-row]').length<=2){
          toast('يجب أن يبقى خياران على الأقل','error');
          return;
        }
        btn.closest('[data-option-row]').remove();
        renumber();
      };
    });

    renumber();
  }

  async function openQuestionForm(quiz,question=null,onDone=async()=>{}) {
    const {modal,title,subtitle,form}=modalElements();
    title.textContent=question?'تعديل السؤال':'إضافة سؤال';
    subtitle.textContent='الاختبار: '+quiz.title;

    const initialType=question?.type || 'multiple_choice';
    const existingOptions=question?.options?.length?question.options:[
      {text:'',isCorrect:true},{text:'',isCorrect:false},{text:'',isCorrect:false},{text:'',isCorrect:false}
    ];

    form.innerHTML=`
      <div class="field full"><label>نوع السؤال</label><select id="quizQuestionType" name="type">
        <option value="multiple_choice" ${initialType==='multiple_choice'?'selected':''}>اختيار من متعدد</option>
        <option value="true_false" ${initialType==='true_false'?'selected':''}>صح / خطأ</option>
        <option value="short_answer" ${initialType==='short_answer'?'selected':''}>إجابة قصيرة</option>
      </select></div>
      <div class="field full"><label>نص السؤال</label><textarea name="prompt" required>${esc(question?.prompt || '')}</textarea></div>
      <div class="field"><label>الدرجة</label><input name="marks" type="number" min="0.25" step="0.25" value="${esc(question?.marks ?? 1)}" required></div>
      <div class="field"><label>الترتيب</label><input name="order" type="number" min="1" value="${esc(question?.order ?? 1)}" required></div>

      <div class="full" id="quizMcqFields">
        <div class="quiz-field-title"><b>الخيارات</b><small>حدد الدائرة بجانب الإجابة الصحيحة.</small></div>
        <div id="quizOptions">
          ${existingOptions.map((o,i)=>optionRow(i,o.text,o.isCorrect)).join('')}
        </div>
        <button class="btn soft" id="quizAddOption" type="button">+ إضافة خيار</button>
      </div>

      <div class="field full" id="quizBooleanFields">
        <label>الإجابة الصحيحة</label>
        <select name="correctBoolean">
          <option value="true" ${question?.correctBoolean===true?'selected':''}>صح</option>
          <option value="false" ${question?.correctBoolean===false?'selected':''}>خطأ</option>
        </select>
      </div>

      <div class="field full"><label>شرح الإجابة <small>يظهر للطالب فقط إذا سمحت بإظهار الإجابات الصحيحة.</small></label><textarea name="explanation">${esc(question?.explanation || '')}</textarea></div>

      <div class="academy-form-message" id="questionFormMessage"></div>
      <div class="academy-form-actions">
        <button class="btn ghost" id="questionCancel" type="button">إلغاء</button>
        <button class="btn primary" type="submit">${question?'حفظ السؤال':'إضافة السؤال'}</button>
      </div>
    `;

    modal.hidden=false;

    const typeSelect=document.getElementById('quizQuestionType');
    const mcq=document.getElementById('quizMcqFields');
    const boolean=document.getElementById('quizBooleanFields');
    const optionBox=document.getElementById('quizOptions');

    const syncType=()=>{
      mcq.hidden=typeSelect.value!=='multiple_choice';
      boolean.hidden=typeSelect.value!=='true_false';
    };

    syncType();
    typeSelect.onchange=syncType;
    bindOptionRows(optionBox);

    document.getElementById('quizAddOption').onclick=()=>{
      const count=optionBox.querySelectorAll('[data-option-row]').length;
      if(count>=8){toast('الحد الأقصى 8 خيارات','error');return;}
      optionBox.insertAdjacentHTML('beforeend',optionRow(count));
      bindOptionRows(optionBox);
    };

    document.getElementById('questionCancel').onclick=closeModal;

    form.onsubmit=async e=>{
      e.preventDefault();
      const btn=form.querySelector('button[type="submit"]');
      const msg=document.getElementById('questionFormMessage');
      const original=btn.textContent;
      const data=Object.fromEntries(new FormData(form).entries());

      data.correctBoolean=data.correctBoolean==='true';

      if(data.type==='multiple_choice'){
        const rows=[...optionBox.querySelectorAll('[data-option-row]')];
        const selected=form.querySelector('input[name="correctOption"]:checked');
        data.options=rows.map((row,index)=>({
          text:row.querySelector('.quiz-option-text').value.trim(),
          isCorrect:Boolean(selected && Number(selected.value)===index)
        }));
      }else{
        data.options=[];
      }

      btn.disabled=true;
      btn.textContent='جاري الحفظ...';
      msg.textContent='';

      try{
        await api(
          question
            ? apiBase() + '/quizzes/'+quiz._id+'/questions/'+question._id
            : apiBase() + '/quizzes/'+quiz._id+'/questions',
          {method:question?'PATCH':'POST',body:JSON.stringify(data)}
        );
        closeModal();
        toast(question?'تم تعديل السؤال':'تمت إضافة السؤال');
        await onDone();
      }catch(err){
        msg.textContent=err.message;
      }finally{
        btn.disabled=false;
        btn.textContent=original;
      }
    };
  }

  function openQuizExtend(quiz,onDone) {
    const {modal,title,subtitle,form}=modalElements();

    title.textContent='تمديد موعد الاختبار';
    subtitle.textContent=quiz.title;
    form.innerHTML=`
      <div class="field full">
        <label>آخر موعد جديد</label>
        <input name="dueAt" type="datetime-local" value="${esc(quiz.dueAtLocal || localDateTime(quiz.dueAt))}" required>
      </div>
      <div class="academy-form-message" id="quizExtendMessage"></div>
      <div class="academy-form-actions">
        <button class="btn ghost" id="quizExtendCancel" type="button">إلغاء</button>
        <button class="btn primary" type="submit">حفظ التمديد</button>
      </div>
    `;

    modal.hidden=false;
    document.getElementById('quizExtendCancel').onclick=closeModal;

    form.onsubmit=async e=>{
      e.preventDefault();
      const button=form.querySelector('button[type="submit"]');
      const message=document.getElementById('quizExtendMessage');
      const original=button.textContent;
      const dueAt=new FormData(form).get('dueAt');

      button.disabled=true;
      button.textContent='جاري الحفظ...';
      message.textContent='';

      try{
        await api(apiBase() + '/quizzes/'+quiz._id,{
          method:'PATCH',
          body:JSON.stringify({dueAt})
        });
        closeModal();
        toast('تم تمديد موعد الاختبار');
        await onDone();
      }catch(err){
        message.textContent=err.message;
      }finally{
        button.disabled=false;
        button.textContent=original;
      }
    };
  }

  async function updateStatus(quiz,next,onDone) {
    try{
      await api(apiBase() + '/quizzes/'+quiz._id,{
        method:'PATCH',
        body:JSON.stringify({status:next})
      });
      toast(next==='published'?'تم نشر الاختبار':next==='closed'?'تم إغلاق الاختبار':'تم تحويله لمسودة');
      await onDone();
    }catch(err){toast(err.message,'error');}
  }

  async function deleteQuestion(quiz,question,onDone) {
    if(!confirm('حذف هذا السؤال نهائيًا؟')) return;
    try{
      await api(apiBase() + '/quizzes/'+quiz._id+'/questions/'+question._id,{method:'DELETE'});
      toast('تم حذف السؤال');
      await onDone();
    }catch(err){toast(err.message,'error');}
  }

  async function openAttempt(quiz,attempt,onDone) {
    const data=await api(apiBase() + '/quizzes/'+quiz._id+'/attempts/'+attempt.id);
    const {modal,title,subtitle,form}=modalElements();
    const a=data.attempt;

    title.textContent='محاولة '+(a.student?.name || 'طالب');
    subtitle.textContent='المحاولة رقم '+a.attemptNumber+' · '+a.percentage+'%';

    form.innerHTML=`
      <div class="quiz-attempt-summary full">
        <span>الدرجة <b>${esc(a.score)} / ${esc(a.totalMarks)}</b></span>
        <span>النسبة <b>${esc(a.percentage)}%</b></span>
        <span>الحالة <b>${a.status==='pending_review'?'تحتاج تصحيح':a.status==='graded'?'مصححة':esc(a.status)}</b></span>
      </div>

      <div class="quiz-review-list full">
        ${data.questions.map((q,index)=>{
          const ans=q.answer;
          let answerText='لم يجب';
          if(q.type==='multiple_choice'){
            answerText=(q.options||[]).find(o=>String(o._id)===String(ans?.selectedOptionId))?.text || 'لم يجب';
          }else if(q.type==='true_false'){
            answerText=typeof ans?.booleanAnswer==='boolean'?(ans.booleanAnswer?'صح':'خطأ'):'لم يجب';
          }else{
            answerText=ans?.textAnswer || 'لم يجب';
          }

          return `
            <article class="quiz-review-item">
              <div class="quiz-review-head">
                <div><small>السؤال ${index+1} · ${questionType(q.type)}</small><b>${esc(q.prompt)}</b></div>
                <span>${esc(ans?.awardedMarks ?? '—')} / ${esc(q.marks)}</span>
              </div>
              <p><strong>إجابة الطالب:</strong> ${esc(answerText)}</p>
              ${q.type==='short_answer' && ans?.needsManualReview ? '<button class="btn primary quiz-grade-answer" data-q="'+esc(q.id)+'" type="button">تصحيح الإجابة</button>' : ''}
              ${ans?.feedback ? '<div class="academy-note">تعليق المدرب: '+esc(ans.feedback)+'</div>' : ''}
            </article>
          `;
        }).join('')}
      </div>
      <div class="academy-form-actions full"><button class="btn ghost" id="attemptClose" type="button">إغلاق</button></div>
    `;

    modal.hidden=false;
    document.getElementById('attemptClose').onclick=closeModal;

    document.querySelectorAll('.quiz-grade-answer').forEach(btn=>{
      btn.onclick=()=>{
        const question=data.questions.find(q=>String(q.id)===String(btn.dataset.q));
        openGradeForm(quiz,attempt,question,onDone);
      };
    });

    form.onsubmit=e=>e.preventDefault();
  }

  function openGradeForm(quiz,attempt,question,onDone) {
    const {modal,title,subtitle,form}=modalElements();
    const answer=question.answer;

    title.textContent='تصحيح إجابة قصيرة';
    subtitle.textContent=question.prompt;

    form.innerHTML=`
      <div class="academy-note full"><b>إجابة الطالب:</b><br>${esc(answer?.textAnswer || 'بدون إجابة')}</div>
      <div class="field"><label>الدرجة من ${esc(question.marks)}</label><input name="awardedMarks" type="number" min="0" max="${esc(question.marks)}" step="0.25" value="${esc(answer?.awardedMarks ?? '')}" required></div>
      <div class="field full"><label>تعليق للطالب</label><textarea name="feedback">${esc(answer?.feedback || '')}</textarea></div>
      <div class="academy-form-message" id="gradeMessage"></div>
      <div class="academy-form-actions">
        <button class="btn ghost" id="gradeCancel" type="button">إلغاء</button>
        <button class="btn primary" type="submit">حفظ التصحيح</button>
      </div>
    `;

    modal.hidden=false;
    document.getElementById('gradeCancel').onclick=closeModal;

    form.onsubmit=async e=>{
      e.preventDefault();
      const btn=form.querySelector('button[type="submit"]');
      const msg=document.getElementById('gradeMessage');
      const original=btn.textContent;
      const payload=Object.fromEntries(new FormData(form).entries());
      btn.disabled=true;btn.textContent='جاري الحفظ...';msg.textContent='';

      try{
        await api(apiBase() + '/quizzes/'+quiz._id+'/attempts/'+attempt.id+'/questions/'+question.id+'/grade',{
          method:'PATCH',
          body:JSON.stringify(payload)
        });
        closeModal();
        toast('تم حفظ التصحيح');
        await onDone();
      }catch(err){msg.textContent=err.message;}
      finally{btn.disabled=false;btn.textContent=original;}
    };
  }

  async function renderBuilder() {
    const target=document.getElementById('pageContent');
    const id=new URLSearchParams(location.search).get('id');

    if(!id){
      target.innerHTML='<div class="academy-card academy-empty">لم يتم تحديد اختبار.</div>';
      return;
    }

    const load=async()=>{
      target.innerHTML='<div class="academy-empty">جاري تحميل الاختبار...</div>';

      try{
        const data=await api(apiBase() + '/quizzes/'+encodeURIComponent(id));
        const quiz=data.quiz;
        const canReviewAttempts=user()?.role !== 'content_manager';
        const editable=quiz.status==='draft' && !data.hasAttempts;

        target.innerHTML=`
          <section class="academy-card quiz-builder-hero">
            <div class="quiz-builder-title">
              <div>
                <a class="quiz-back-link" href="${portalPath('quizzes.html')}">← الاختبارات</a>
                <span class="quiz-course-label">${esc(quiz.courseId?.title || '')}</span>
                <h2>${esc(quiz.title)}</h2>
                <p>${esc(quiz.description || 'بدون تعليمات إضافية.')}</p>
              </div>
              <div class="academy-actions quiz-builder-actions">
                ${status(quiz.status)}
                <button class="btn soft" id="quizEditSettings" type="button">الإعدادات</button>
                <button class="btn soft" id="quizExtendDate" type="button">تمديد الموعد</button>
                ${quiz.status==='draft'
                  ? '<button class="btn primary" id="quizStatusAction" data-status="published" type="button">نشر الاختبار</button>'
                  : quiz.status==='published'
                    ? '<button class="btn secondary" id="quizStatusAction" data-status="closed" type="button">إغلاق الاختبار</button>'
                    : '<button class="btn primary" id="quizStatusAction" data-status="published" type="button">إعادة النشر</button>'}
              </div>
            </div>

            <div class="quiz-builder-metrics">
              <span><small>الأسئلة</small><b>${esc(data.questions.length)}</b></span>
              <span><small>الدرجة</small><b>${esc(quiz.totalMarks)}</b></span>
              <span><small>المدة</small><b>${esc(quiz.durationMinutes || 0)} د</b></span>
              <span><small>المحاولات</small><b>${esc(quiz.maxAttempts)}</b></span>
              <span><small>النجاح</small><b>${esc(quiz.passingPercentage)}%</b></span>
            </div>
          </section>

          <section class="academy-card academy-section">
            <div class="academy-card-head">
              <div><h2>أسئلة الاختبار</h2><p>${editable?'يمكنك إضافة وتعديل الأسئلة أثناء كون الاختبار مسودة.':'الأسئلة مقفلة بعد النشر أو بدء المحاولات.'}</p></div>
              ${editable?'<button class="btn primary" id="quizAddQuestion" type="button">+ إضافة سؤال</button>':''}
            </div>

            <div class="quiz-question-list">
              ${data.questions.length?data.questions.map((q,index)=>`
                <article class="quiz-question-card">
                  <div class="quiz-question-number">${index+1}</div>
                  <div class="quiz-question-content">
                    <div class="quiz-question-head">
                      <div><span>${questionType(q.type)} · ${esc(q.marks)} درجة</span><h3>${esc(q.prompt)}</h3></div>
                      ${editable?`
                        <div class="academy-actions">
                          <button class="btn soft quiz-edit-question" data-id="${esc(q._id)}" type="button">تعديل</button>
                          <button class="btn ghost quiz-delete-question" data-id="${esc(q._id)}" type="button">حذف</button>
                        </div>`:''}
                    </div>
                    ${q.type==='multiple_choice'?'<div class="quiz-answer-options">'+(q.options||[]).map(o=>'<span class="'+(o.isCorrect?'correct':'')+'">'+esc(o.text)+(o.isCorrect?' ✓':'')+'</span>').join('')+'</div>':''}
                    ${q.type!=='multiple_choice'?'<div class="quiz-correct-answer">الإجابة: '+esc(renderQuestionCorrect(q))+'</div>':''}
                    ${q.explanation?'<p class="quiz-explanation">'+esc(q.explanation)+'</p>':''}
                  </div>
                </article>
              `).join(''):'<div class="academy-empty">ابدأ بإضافة أول سؤال للاختبار.</div>'}
            </div>
          </section>

          ${canReviewAttempts ? `
            <section class="academy-card academy-section">
              <div class="academy-card-head">
                <div><h2>محاولات الطلاب</h2><p>النتائج والتصحيح اليدوي للإجابات القصيرة.</p></div>
                <span class="academy-status info">${esc(data.attempts.length)} محاولة</span>
              </div>

              <div class="academy-table-wrap">
                <table class="academy-table">
                  <thead><tr><th>الطالب</th><th>المحاولة</th><th>الحالة</th><th>الدرجة</th><th>النسبة</th><th>التسليم</th><th>إجراء</th></tr></thead>
                  <tbody>
                    ${data.attempts.length?data.attempts.map(a=>`
                      <tr>
                        <td><b>${esc(a.student?.name || 'طالب')}</b><br><small>${esc(a.student?.email || '')}</small></td>
                        <td>#${esc(a.attemptNumber)}</td>
                        <td>${status(a.status)}</td>
                        <td>${esc(a.score)} / ${esc(a.totalMarks)}</td>
                        <td>${esc(a.percentage)}%</td>
                        <td>${fmtDate(a.submittedAt,true)}</td>
                        <td><button class="btn ${a.requiresManualReview?'primary':'soft'} quiz-open-attempt" data-id="${esc(a.id)}" type="button">${a.requiresManualReview?'تصحيح':'عرض'}</button></td>
                      </tr>
                    `).join(''):'<tr><td colspan="7" class="academy-empty">لا توجد محاولات حتى الآن.</td></tr>'}
                  </tbody>
                </table>
              </div>
            </section>
          ` : ''}
        `;

        document.getElementById('quizEditSettings').onclick=()=>openQuizForm(quiz,load);
        document.getElementById('quizExtendDate').onclick=()=>openQuizExtend(quiz,load);

        const statusBtn=document.getElementById('quizStatusAction');
        if(statusBtn) statusBtn.onclick=()=>updateStatus(quiz,statusBtn.dataset.status,load);

        const add=document.getElementById('quizAddQuestion');
        if(add) add.onclick=()=>openQuestionForm(quiz,null,load);

        document.querySelectorAll('.quiz-edit-question').forEach(btn=>{
          btn.onclick=()=>{
            const question=data.questions.find(q=>String(q._id)===String(btn.dataset.id));
            openQuestionForm(quiz,question,load);
          };
        });

        document.querySelectorAll('.quiz-delete-question').forEach(btn=>{
          btn.onclick=()=>{
            const question=data.questions.find(q=>String(q._id)===String(btn.dataset.id));
            deleteQuestion(quiz,question,load);
          };
        });

        document.querySelectorAll('.quiz-open-attempt').forEach(btn=>{
          btn.onclick=()=>{
            const attempt=data.attempts.find(a=>String(a.id)===String(btn.dataset.id));
            openAttempt(quiz,attempt,load).catch(err=>toast(err.message,'error'));
          };
        });

      }catch(err){
        target.innerHTML='<div class="academy-card academy-empty">'+esc(err.message)+'</div>';
      }
    };

    await load();
  }

  return { renderList, renderBuilder };
})();