window.StudentQuiz = (() => {
  let timerId=null;
  let autoSubmitting=false;
  let saveTimer=null;

  function esc(value){
    return String(value ?? '')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#039;');
  }

  const studentTimeZone=(()=>{
    try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';}
    catch{return 'UTC';}
  })();

  function fmtDate(value,withTime=false){
    if(!value)return '—';
    const d=new Date(value);
    if(Number.isNaN(d.getTime()))return '—';
    return withTime
      ? d.toLocaleString('ar-OM',{dateStyle:'medium',timeStyle:'short',timeZone:studentTimeZone})
      : d.toLocaleDateString('ar-OM',{dateStyle:'medium',timeZone:studentTimeZone});
  }

  function status(value){
    const map={
      in_progress:['جارية','warn'],
      pending_review:['بانتظار التصحيح','warn'],
      graded:['مصححة','good'],
      expired:['انتهى الوقت','bad'],
      published:['متاح','good'],
      closed:['مغلق','bad']
    };
    const item=map[value]||[value||'—','info'];
    return '<span class="student-status '+item[1]+'">'+esc(item[0])+'</span>';
  }

  async function api(url,options={}){
    const parsed=new URL(String(url),location.origin);
    if(parsed.origin!==location.origin || !parsed.pathname.startsWith('/api/student/')){
      throw new Error('عنوان الطلب غير مسموح');
    }
    const safeUrl=parsed.pathname+parsed.search;
    const response=await fetch(safeUrl,{
      ...options,
      credentials:'same-origin',
      headers:{
        ...(options.body?{'Content-Type':'application/json'}:{}),
        ...(options.headers||{})
      }
    });

    if(response.status===401){
      localStorage.removeItem('af_user');
      location.replace('/academy/login.html');
      throw new Error('انتهت الجلسة');
    }

    const text=await response.text();
    let data=null;
    try{data=text?JSON.parse(text):null;}catch{data=text;}
    if(!response.ok)throw new Error(data?.message||'تعذر تنفيذ العملية');
    return data;
  }

  async function trustedAttemptId(value){
    const requested=String(value||'').trim();
    if(!/^[a-f0-9]{24}$/i.test(requested)){
      throw new Error('معرف المحاولة غير صحيح');
    }

    const quizzes=await api('/api/student/quizzes');
    for(const quiz of quizzes){
      const candidates=[
        ...(Array.isArray(quiz.attempts)?quiz.attempts:[]),
        ...(quiz.activeAttempt?[quiz.activeAttempt]:[])
      ];
      const match=candidates.find(item=>String(item?.id||'')===requested);
      if(match)return String(match.id);
    }

    throw new Error('المحاولة غير موجودة أو لا تخص حسابك');
  }

  function toast(message,type='ok'){
    let box=document.getElementById('studentQuizToast');
    if(!box){
      box=document.createElement('div');
      box.id='studentQuizToast';
      box.className='student-quiz-toast';
      document.body.appendChild(box);
    }
    box.textContent=message;
    box.classList.toggle('error',type==='error');
    box.classList.add('show');
    clearTimeout(box._timer);
    box._timer=setTimeout(()=>box.classList.remove('show'),2400);
  }

  function attemptLabel(a){
    if(a.status==='graded')return a.passed?'ناجح':'غير مجتاز';
    if(a.status==='pending_review')return 'بانتظار التصحيح';
    if(a.status==='in_progress')return 'محاولة جارية';
    return a.status;
  }

  function quizState(q){
    const now=Date.now();
    if(q.activeAttempt){
      return {label:'محاولة جارية',tone:'warn',detail:'عندك محاولة بدأت من قبل. كملها من نفس المكان.'};
    }
    if(q.status==='closed'){
      return {label:'مغلق',tone:'bad',detail:'هذا الاختبار مغلق حاليًا.'};
    }
    if(q.availableFrom && new Date(q.availableFrom).getTime()>now){
      return {label:'قريبًا',tone:'info',detail:'يفتح '+fmtDate(q.availableFrom,true)};
    }
    if(q.dueAt && new Date(q.dueAt).getTime()<=now){
      return {label:'انتهى',tone:'bad',detail:'انتهى موعد الاختبار.'};
    }
    if(Number(q.attempts?.length||0)>=Number(q.maxAttempts||1)){
      return {label:'اكتملت المحاولات',tone:'bad',detail:'استخدمت كل المحاولات المتاحة.'};
    }
    if(q.canStart){
      return {label:'جاهز للبدء',tone:'good',detail:'تقدر تبدأ الاختبار الآن.'};
    }
    return {label:'غير متاح',tone:'info',detail:'الاختبار غير متاح للبدء حاليًا.'};
  }

  function durationLabel(q){
    return Number(q.durationMinutes||0)>0
      ? Number(q.durationMinutes)+' دقيقة'
      : 'بدون مؤقت مستقل';
  }

  function remainingAttempts(q){
    return Math.max(0,Number(q.maxAttempts||1)-Number(q.attempts?.length||0));
  }

  function openStartDialog(quiz,onStart){
    document.getElementById('studentQuizStartDialog')?.remove();
    const state=quizState(quiz);
    const overlay=document.createElement('div');
    overlay.id='studentQuizStartDialog';
    overlay.className='student-quiz-dialog-backdrop';
    overlay.innerHTML=`
      <div class="student-quiz-dialog" role="dialog" aria-modal="true" aria-labelledby="studentQuizDialogTitle">
        <button class="student-quiz-dialog-close" type="button" aria-label="إغلاق">×</button>
        <div class="student-quiz-dialog-icon">✓</div>
        <span class="student-quiz-dialog-kicker">قبل ما تبدأ</span>
        <h2 id="studentQuizDialogTitle">${esc(quiz.title)}</h2>
        <p>راجع البيانات ذي بسرعة. <b>المؤقت يبدأ مباشرة</b> بعد ما تضغط «ابدأ الآن».</p>

        <div class="student-quiz-dialog-facts">
          <div><small>الأسئلة</small><strong>${esc(quiz.questionCount||0)}</strong></div>
          <div><small>المدة</small><strong>${esc(durationLabel(quiz))}</strong></div>
          <div><small>المحاولات الباقية</small><strong>${esc(remainingAttempts(quiz))}</strong></div>
          <div><small>نسبة النجاح</small><strong>${esc(quiz.passingPercentage)}%</strong></div>
        </div>

        ${Number(quiz.listeningQuestionCount||0)>0?`
          <div class="student-quiz-dialog-listening">
            <span>🎧</span>
            <div><b>الاختبار فيه استماع</b><small>${esc(quiz.listeningQuestionCount)} سؤال فيه مقطع صوتي. تأكد إن الصوت شغال عندك.</small></div>
          </div>
        `:''}

        <div class="student-quiz-dialog-notes">
          <span>• إجاباتك تنحفظ تلقائيًا أثناء الحل.</span>
          <span>• تقدر تنتقل بين الأسئلة قبل التسليم.</span>
          <span>• بعد التسليم ما تقدر تعدّل إجاباتك.</span>
        </div>

        <div class="student-quiz-dialog-actions">
          <button class="btn ghost" id="studentQuizCancelStart" type="button">رجوع</button>
          <button class="btn primary" id="studentQuizConfirmStart" type="button">ابدأ الآن</button>
        </div>
        <div class="student-quiz-dialog-state ${esc(state.tone)}">${esc(state.detail)}</div>
      </div>
    `;

    const close=()=>{
      overlay.remove();
      document.body.classList.remove('student-quiz-dialog-open');
    };

    document.body.appendChild(overlay);
    document.body.classList.add('student-quiz-dialog-open');

    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    overlay.querySelector('.student-quiz-dialog-close').onclick=close;
    overlay.querySelector('#studentQuizCancelStart').onclick=close;
    overlay.querySelector('#studentQuizConfirmStart').onclick=async()=>{
      const button=overlay.querySelector('#studentQuizConfirmStart');
      button.disabled=true;
      button.textContent='جاري البدء...';
      try{
        await onStart();
        close();
      }catch(err){
        button.disabled=false;
        button.textContent='ابدأ الآن';
        toast(err.message,'error');
      }
    };
  }

  async function renderList(){
    clearInterval(timerId);
    const target=document.getElementById('studentPageContent');
    target.innerHTML='<div class="student-empty">جاري تحميل الاختبارات...</div>';

    try{
      const rows=await api('/api/student/quizzes');
      const readyCount=rows.filter(q=>q.canStart).length;
      const activeCount=rows.filter(q=>q.activeAttempt).length;

      target.innerHTML=`
        <section class="student-quiz-welcome">
          <div class="student-quiz-welcome-copy">
            <span class="student-quiz-welcome-kicker">الاختبارات</span>
            <h2>كل شيء واضح قبل ما تبدأ</h2>
            <p>راجع وقت الاختبار والمحاولات ونسبة النجاح، وبعدها ابدأ وانت عارف وش بيصير خطوة بخطوة.</p>
          </div>
          <div class="student-quiz-welcome-stats">
            <div><strong>${readyCount}</strong><span>جاهز الآن</span></div>
            <div><strong>${activeCount}</strong><span>محاولة جارية</span></div>
            <div><strong>${rows.length}</strong><span>كل الاختبارات</span></div>
          </div>
          <div class="student-quiz-guide">
            <div><i>1</i><span><b>راجع البيانات</b><small>المدة والمحاولات والنجاح.</small></span></div>
            <div><i>2</i><span><b>ابدأ لما تكون جاهز</b><small>المؤقت يبدأ بعد التأكيد.</small></span></div>
            <div><i>3</i><span><b>جاوب براحتك</b><small>الإجابات تنحفظ تلقائيًا.</small></span></div>
          </div>
        </section>

        <section class="student-card student-quiz-list-shell">
          <div class="student-card-head student-quiz-list-head">
            <div><h2>اختبارات دوراتك</h2><p>الاختبار الجاهز يبان لك بوضوح، والغير متاح يوضح لك السبب.</p></div>
            <span class="student-quiz-count">${rows.length} اختبار</span>
          </div>

          ${rows.length?'<div class="student-quiz-grid student-quiz-grid-v2">'+rows.map((q,index)=>{
            const state=quizState(q);
            const listening=Number(q.listeningQuestionCount||0);
            return `
              <article class="student-quiz-card student-quiz-card-v2 ${q.activeAttempt?'has-active':''}">
                <div class="student-quiz-card-topline">
                  <span class="student-quiz-course">${esc(q.course?.title||'دورة')}</span>
                  <span class="student-quiz-state ${esc(state.tone)}">${esc(state.label)}</span>
                </div>

                <div class="student-quiz-card-title-row">
                  <div>
                    <h3>${esc(q.title)}</h3>
                    <p>${esc(q.description||'اقرأ بيانات الاختبار تحت قبل ما تبدأ.')}</p>
                  </div>
                  <span class="student-quiz-score-chip"><b>${esc(q.totalMarks)}</b><small>درجة</small></span>
                </div>

                ${listening>0?`
                  <div class="student-quiz-listening-chip">
                    <span>🎧</span>
                    <div><b>يتضمن استماع</b><small>${esc(listening)} سؤال صوتي</small></div>
                  </div>
                `:''}

                <div class="student-quiz-facts">
                  <div><span class="student-quiz-fact-icon">؟</span><small>الأسئلة</small><b>${esc(q.questionCount||0)}</b></div>
                  <div><span class="student-quiz-fact-icon">◷</span><small>المدة</small><b>${esc(durationLabel(q))}</b></div>
                  <div><span class="student-quiz-fact-icon">↻</span><small>المحاولات الباقية</small><b>${esc(remainingAttempts(q))} من ${esc(q.maxAttempts)}</b></div>
                  <div><span class="student-quiz-fact-icon">✓</span><small>النجاح</small><b>${esc(q.passingPercentage)}%</b></div>
                </div>

                <div class="student-quiz-window">
                  <div><small>يفتح</small><b>${q.availableFrom?fmtDate(q.availableFrom,true):'متاح الآن'}</b></div>
                  <i></i>
                  <div><small>يغلق</small><b>${q.dueAt?fmtDate(q.dueAt,true):'بدون موعد إغلاق'}</b></div>
                </div>

                <div class="student-quiz-state-note ${esc(state.tone)}">${esc(state.detail)}</div>

                <div class="student-quiz-actions student-quiz-actions-v2">
                  ${q.activeAttempt
                    ? '<a class="btn primary" href="/student/quiz.html?attempt='+encodeURIComponent(q.activeAttempt.id)+'">كمل المحاولة ←</a>'
                    : q.canStart
                      ? '<button class="btn primary student-start-quiz" data-index="'+index+'" type="button">راجع ثم ابدأ الاختبار</button>'
                      : '<button class="btn ghost" type="button" disabled>'+esc(state.label)+'</button>'}
                </div>

                ${q.attempts.length?`
                  <details class="student-quiz-history student-quiz-history-v2">
                    <summary>المحاولات السابقة <span>${q.attempts.length}</span></summary>
                    <div class="student-quiz-history-list">
                      ${q.attempts.map(a=>`
                        <div>
                          <span><b>#${esc(a.attemptNumber)}</b> · ${esc(attemptLabel(a))}</span>
                          <span>${a.status==='graded'||a.status==='pending_review'?esc(a.percentage)+'%':''}
                            ${a.status!=='in_progress'?'<a href="/student/quiz.html?result='+encodeURIComponent(a.id)+'">عرض النتيجة</a>':''}
                          </span>
                        </div>
                      `).join('')}
                    </div>
                  </details>
                `:''}
              </article>
            `;
          }).join('')+'</div>':'<div class="student-empty">لا توجد اختبارات منشورة في دوراتك حاليًا.</div>'}
        </section>
      `;

      document.querySelectorAll('.student-start-quiz').forEach(btn=>{
        btn.onclick=()=>{
          const quiz=rows[Number(btn.dataset.index)];
          openStartDialog(quiz,async()=>{
            const data=await api('/api/student/quizzes/'+quiz.id+'/start',{method:'POST'});
            location.href='/student/quiz.html?attempt='+encodeURIComponent(data.attempt.id);
          });
        };
      });
    }catch(err){
      target.innerHTML='<div class="student-card student-empty">'+esc(err.message)+'</div>';
    }
  }

  function formatTime(seconds){
    seconds=Math.max(0,Number(seconds||0));
    const h=Math.floor(seconds/3600);
    const m=Math.floor((seconds%3600)/60);
    const s=seconds%60;
    return h>0
      ? [h,m,s].map(x=>String(x).padStart(2,'0')).join(':')
      : [m,s].map(x=>String(x).padStart(2,'0')).join(':');
  }

  function answered(question){
    const a=question.answer;
    if(!a)return false;
    if(question.type==='multiple_choice')return Boolean(a.selectedOptionId);
    if(question.type==='true_false')return typeof a.booleanAnswer==='boolean';
    return Boolean(String(a.textAnswer||'').trim());
  }

  async function saveAnswer(attemptId,question,payload,silent=false){
    try{
      const data=await api('/api/student/quiz-attempts/'+attemptId+'/questions/'+question.id,{
        method:'PATCH',
        body:JSON.stringify(payload)
      });
      if(!silent)toast('تم حفظ الإجابة');
      return data;
    }catch(err){
      toast(err.message,'error');
      throw err;
    }
  }

  async function submitAttempt(attemptId,automatic=false){
    if(autoSubmitting)return;
    autoSubmitting=true;
    clearInterval(timerId);
    clearTimeout(saveTimer);

    try{
      const data=await api('/api/student/quiz-attempts/'+attemptId+'/submit',{method:'POST'});
      if(automatic)toast('انتهى الوقت وتم تسليم الاختبار تلقائيًا');
      location.replace('/student/quiz.html?result='+encodeURIComponent(data.attempt.id));
    }catch(err){
      autoSubmitting=false;
      toast(err.message,'error');
    }
  }

  function listeningAudio(question){
    if(!question?.audio?.url)return '';
    return `
      <div class="student-quiz-listening">
        <div class="student-quiz-listening-head">
          <span>🎧 سؤال استماع</span>
          <b>${esc(question.audio.title||'مقطع الاستماع')}</b>
        </div>
        <audio controls preload="metadata" controlsList="nodownload" src="${esc(question.audio.url)}">
          متصفحك لا يدعم تشغيل الصوت.
        </audio>
        <small>شغّل المقطع، اسمعه زين، وبعدها جاوب على السؤال تحت.</small>
      </div>
    `;
  }

  function questionTypeLabel(question){
    if(question.type==='multiple_choice')return 'اختيار من متعدد';
    if(question.type==='true_false')return 'صح أو خطأ';
    return 'إجابة كتابية';
  }

  function questionInstruction(question){
    if(question.type==='multiple_choice')return 'اختر إجابة واحدة فقط من الخيارات.';
    if(question.type==='true_false')return 'حدد إذا كانت العبارة صحيحة أو خاطئة.';
    return 'اكتب إجابتك في المربع، وبتنحفظ تلقائيًا.';
  }

  function openSubmitDialog(answeredCount,total,onSubmit){
    document.getElementById('studentQuizSubmitDialog')?.remove();
    const unanswered=Math.max(0,total-answeredCount);
    const overlay=document.createElement('div');
    overlay.id='studentQuizSubmitDialog';
    overlay.className='student-quiz-dialog-backdrop';
    overlay.innerHTML=`
      <div class="student-quiz-dialog student-quiz-submit-dialog" role="dialog" aria-modal="true" aria-labelledby="studentQuizSubmitTitle">
        <button class="student-quiz-dialog-close" type="button" aria-label="إغلاق">×</button>
        <div class="student-quiz-dialog-icon submit">✓</div>
        <span class="student-quiz-dialog-kicker">مراجعة أخيرة</span>
        <h2 id="studentQuizSubmitTitle">متأكد إنك تبا تسلّم؟</h2>
        <p>بعد التسليم ما تقدر ترجع تغيّر إجاباتك.</p>
        <div class="student-quiz-submit-summary">
          <div class="done"><strong>${answeredCount}</strong><span>سؤال مجاب</span></div>
          <div class="${unanswered?'warn':'done'}"><strong>${unanswered}</strong><span>سؤال بدون إجابة</span></div>
        </div>
        ${unanswered?`<div class="student-quiz-dialog-warning">عندك ${unanswered} سؤال ما جاوبت عليه. تقدر ترجع تراجعه قبل التسليم.</div>`:''}
        <div class="student-quiz-dialog-actions">
          <button class="btn ghost" id="studentQuizBackToExam" type="button">ارجع راجع</button>
          <button class="btn primary" id="studentQuizSubmitNow" type="button">سلّم الاختبار</button>
        </div>
      </div>
    `;

    const close=()=>{
      overlay.remove();
      document.body.classList.remove('student-quiz-dialog-open');
    };

    document.body.appendChild(overlay);
    document.body.classList.add('student-quiz-dialog-open');
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    overlay.querySelector('.student-quiz-dialog-close').onclick=close;
    overlay.querySelector('#studentQuizBackToExam').onclick=close;
    overlay.querySelector('#studentQuizSubmitNow').onclick=()=>{
      const button=overlay.querySelector('#studentQuizSubmitNow');
      button.disabled=true;
      button.textContent='جاري التسليم...';
      onSubmit();
    };
  }

  function questionInput(question,attemptId,onChanged){
    const a=question.answer||{};

    if(question.type==='multiple_choice'){
      return `
        <div class="student-quiz-options">
          ${question.options.map((option,index)=>`
            <label class="student-quiz-option">
              <input type="radio" name="quizAnswer" value="${esc(option.id)}" ${String(a.selectedOptionId||'')===String(option.id)?'checked':''}>
              <span><i></i><em>${String.fromCharCode(65+index)}</em><b>${esc(option.text)}</b></span>
            </label>
          `).join('')}
        </div>
      `;
    }

    if(question.type==='true_false'){
      return `
        <div class="student-quiz-options student-quiz-boolean">
          <label class="student-quiz-option">
            <input type="radio" name="quizBoolean" value="true" ${a.booleanAnswer===true?'checked':''}>
            <span><i></i><b>صح</b></span>
          </label>
          <label class="student-quiz-option">
            <input type="radio" name="quizBoolean" value="false" ${a.booleanAnswer===false?'checked':''}>
            <span><i></i><b>خطأ</b></span>
          </label>
        </div>
      `;
    }

    return `
      <div class="field student-quiz-text">
        <label>إجابتك</label>
        <textarea id="quizTextAnswer" maxlength="10000" placeholder="اكتب إجابتك هنا...">${esc(a.textAnswer||'')}</textarea>
        <small>ما تحتاج تضغط حفظ — الإجابة تنحفظ تلقائيًا.</small>
      </div>
    `;
  }

  async function renderAttempt(attemptId){
    const target=document.getElementById('studentPageContent');
    target.innerHTML='<div class="student-empty">جاري فتح المحاولة...</div>';

    try{
      const data=await api('/api/student/quiz-attempts/'+encodeURIComponent(attemptId));

      if(data.completed){
        location.replace('/student/quiz.html?result='+encodeURIComponent(data.attempt.id));
        return;
      }

      const questions=data.questions;
      const attempt=data.attempt;
      const firstUnanswered=questions.findIndex(item=>!answered(item));
      let index=firstUnanswered>=0?firstUnanswered:0;
      let seconds=attempt.remainingSeconds;
      let submitted=false;

      const draw=()=>{
        const q=questions[index];
        const answeredCount=questions.filter(answered).length;
        const progress=questions.length?Math.round((answeredCount/questions.length)*100):0;

        target.innerHTML=`
          <section class="student-quiz-exam-head student-quiz-exam-head-v2">
            <div class="student-quiz-exam-copy">
              <a href="/student/quizzes.html" class="student-quiz-exit">← رجوع للاختبارات</a>
              <span class="student-quiz-course">${esc(data.quiz.course?.title||'')}</span>
              <h2>${esc(data.quiz.title)}</h2>
              <p>المحاولة #${esc(attempt.attemptNumber)} · جاوب على راحتك، وكل إجابة تنحفظ تلقائيًا.</p>
              <div class="student-quiz-progress">
                <div class="student-quiz-progress-copy">
                  <span>تقدمك</span>
                  <b><span id="quizAnsweredCount">${answeredCount}</span> من ${questions.length} مجاب</b>
                </div>
                <div class="student-quiz-progress-track"><i id="quizProgressBar" style="width:${progress}%"></i></div>
              </div>
            </div>
            <div class="student-quiz-timer ${seconds!==null&&seconds<=300?'danger':''}">
              <small>الوقت المتبقي</small>
              <b id="quizTimer">${seconds===null?'بدون مؤقت':formatTime(seconds)}</b>
              <span>${seconds===null?'خذ وقتك وراجع قبل التسليم':'لا تقفل الصفحة أثناء الاختبار'}</span>
            </div>
          </section>

          <section class="student-quiz-exam-layout student-quiz-exam-layout-v2">
            <article class="student-card student-quiz-question student-quiz-question-v2">
              <div class="student-quiz-question-head student-quiz-question-head-v2">
                <div>
                  <span class="student-quiz-question-number-label">السؤال ${index+1} من ${questions.length}</span>
                  <span class="student-quiz-question-type">${esc(questionTypeLabel(q))}${q.audio?' · استماع':''}</span>
                </div>
                <b>${esc(q.marks)} ${Number(q.marks)===1?'درجة':'درجات'}</b>
              </div>

              ${listeningAudio(q)}

              <div class="student-quiz-prompt">
                <h3>${esc(q.prompt)}</h3>
                <p>${esc(questionInstruction(q))}</p>
              </div>

              ${questionInput(q,attemptId)}

              <div class="student-quiz-nav student-quiz-nav-v2">
                <button class="btn ghost" id="quizPrev" type="button" ${index===0?'disabled':''}>السؤال السابق</button>
                <div class="student-quiz-save-state saved" id="quizSaveState"><span>✓</span> محفوظ</div>
                ${index<questions.length-1
                  ? '<button class="btn primary" id="quizNext" type="button">السؤال التالي</button>'
                  : '<button class="btn primary" id="quizSubmit" type="button">راجع وسلّم</button>'}
              </div>
            </article>

            <aside class="student-card student-quiz-map student-quiz-map-v2">
              <div class="student-quiz-map-head">
                <div><h3>التنقل بين الأسئلة</h3><p>اضغط رقم أي سؤال عشان ترجع له.</p></div>
                <strong><span id="quizMapAnsweredCount">${answeredCount}</span>/${questions.length}</strong>
              </div>
              <div class="student-quiz-map-grid">
                ${questions.map((item,i)=>`
                  <button class="${i===index?'active':''} ${answered(item)?'answered':''}" data-index="${i}" type="button" aria-label="السؤال ${i+1}">${i+1}</button>
                `).join('')}
              </div>
              <div class="student-quiz-map-legend">
                <span><i class="answered"></i>مجاب</span>
                <span><i class="current"></i>الحالي</span>
                <span><i></i>غير مجاب</span>
              </div>
              <div class="student-quiz-map-tip">تقدر تغيّر أي إجابة قبل ما تسلّم الاختبار.</div>
            </aside>
          </section>
        `;

        const setSaving=(txt,state='')=>{
          const el=document.getElementById('quizSaveState');
          if(!el)return;
          el.className='student-quiz-save-state '+state;
          el.innerHTML=(state==='saved'?'<span>✓</span> ':'')+esc(txt);
        };

        const refreshProgress=()=>{
          const count=questions.filter(answered).length;
          const pct=questions.length?Math.round((count/questions.length)*100):0;
          const answeredEl=document.getElementById('quizAnsweredCount');
          const mapCount=document.getElementById('quizMapAnsweredCount');
          const bar=document.getElementById('quizProgressBar');
          if(answeredEl)answeredEl.textContent=count;
          if(mapCount)mapCount.textContent=count;
          if(bar)bar.style.width=pct+'%';
          const mapButton=document.querySelector('.student-quiz-map-grid button[data-index="'+index+'"]');
          if(mapButton)mapButton.classList.toggle('answered',answered(q));
        };

        document.querySelectorAll('input[name="quizAnswer"]').forEach(input=>{
          input.onchange=async()=>{
            q.answer={...(q.answer||{}),selectedOptionId:input.value,booleanAnswer:null,textAnswer:''};
            refreshProgress();
            setSaving('جاري الحفظ...','saving');
            try{
              await saveAnswer(attemptId,q,{selectedOptionId:input.value},true);
              setSaving('محفوظ','saved');
            }catch{setSaving('تعذر الحفظ','error');}
          };
        });

        document.querySelectorAll('input[name="quizBoolean"]').forEach(input=>{
          input.onchange=async()=>{
            const value=input.value==='true';
            q.answer={...(q.answer||{}),booleanAnswer:value,selectedOptionId:'',textAnswer:''};
            refreshProgress();
            setSaving('جاري الحفظ...','saving');
            try{
              await saveAnswer(attemptId,q,{booleanAnswer:value},true);
              setSaving('محفوظ','saved');
            }catch{setSaving('تعذر الحفظ','error');}
          };
        });

        const text=document.getElementById('quizTextAnswer');
        if(text){
          text.oninput=()=>{
            q.answer={...(q.answer||{}),textAnswer:text.value,selectedOptionId:'',booleanAnswer:null};
            refreshProgress();
            setSaving('جاري الحفظ...','saving');
            clearTimeout(saveTimer);
            saveTimer=setTimeout(async()=>{
              try{
                await saveAnswer(attemptId,q,{textAnswer:text.value},true);
                setSaving('محفوظ','saved');
              }catch{setSaving('تعذر الحفظ','error');}
            },650);
          };
        }

        document.getElementById('quizPrev').onclick=()=>{
          clearTimeout(saveTimer);
          index=Math.max(0,index-1);
          draw();
        };

        const next=document.getElementById('quizNext');
        if(next)next.onclick=()=>{
          clearTimeout(saveTimer);
          index=Math.min(questions.length-1,index+1);
          draw();
        };

        const submit=document.getElementById('quizSubmit');
        if(submit)submit.onclick=()=>{
          const count=questions.filter(answered).length;
          openSubmitDialog(count,questions.length,()=>{
            submitted=true;
            submitAttempt(attemptId,false);
          });
        };

        document.querySelectorAll('.student-quiz-map button').forEach(btn=>{
          btn.onclick=()=>{
            clearTimeout(saveTimer);
            index=Number(btn.dataset.index);
            draw();
          };
        });
      };

      draw();

      clearInterval(timerId);
      if(seconds!==null){
        timerId=setInterval(()=>{
          seconds=Math.max(0,seconds-1);
          const timer=document.getElementById('quizTimer');
          if(timer)timer.textContent=formatTime(seconds);

          const box=timer?.closest('.student-quiz-timer');
          if(box)box.classList.toggle('danger',seconds<=300);

          if(seconds<=0 && !submitted){
            submitted=true;
            clearInterval(timerId);
            submitAttempt(attemptId,true);
          }
        },1000);
      }

    }catch(err){
      target.innerHTML='<div class="student-card student-empty">'+esc(err.message)+'</div>';
    }
  }

  function resultAnswerText(question){
    const a=question.answer;
    if(!a)return 'لم تتم الإجابة';

    if(question.type==='multiple_choice'){
      return question.options.find(o=>String(o.id)===String(a.selectedOptionId))?.text || 'لم تتم الإجابة';
    }
    if(question.type==='true_false'){
      return typeof a.booleanAnswer==='boolean'?(a.booleanAnswer?'صح':'خطأ'):'لم تتم الإجابة';
    }
    return a.textAnswer||'لم تتم الإجابة';
  }

  function correctText(question){
    if(!question.correctAnswer)return '';
    if(question.type==='multiple_choice')return question.correctAnswer.correctOptionText||'';
    if(question.type==='true_false')return question.correctAnswer.correctBoolean?'صح':'خطأ';
    return '';
  }

  async function renderResult(attemptId){
    clearInterval(timerId);
    const target=document.getElementById('studentPageContent');
    target.innerHTML='<div class="student-empty">جاري تحميل النتيجة...</div>';

    try{
      const data=await api('/api/student/quiz-attempts/'+encodeURIComponent(attemptId)+'/result');
      const a=data.attempt;
      const pending=a.requiresManualReview||a.status==='pending_review';

      target.innerHTML=`
        <section class="student-quiz-result-hero ${pending?'pending':a.passed?'passed':'failed'}">
          <div>
            <a href="/student/quizzes.html" class="student-quiz-exit">← العودة للاختبارات</a>
            <span class="student-quiz-course">${esc(data.quiz.course?.title||'')}</span>
            <h2>${esc(data.quiz.title)}</h2>
            <p>${pending?'توجد إجابات قصيرة تحتاج إلى تصحيح المدرب. النتيجة النهائية قد تتغير.':a.passed?'تم اجتياز الاختبار بنجاح.':'لم تصل إلى نسبة النجاح المطلوبة.'}</p>
          </div>
          <div class="student-quiz-result-score">
            <strong>${esc(a.percentage)}%</strong>
            <span>${esc(a.score)} / ${esc(a.totalMarks)}</span>
          </div>
        </section>

        <section class="student-card student-section">
          <div class="student-card-head">
            <div><h2>مراجعة الإجابات</h2><p>${data.quiz.showCorrectAnswers?'الأكاديمية تسمح بعرض الإجابات الصحيحة.':'الإجابات الصحيحة مخفية حسب إعداد الاختبار.'}</p></div>
            ${status(a.status)}
          </div>

          <div class="student-quiz-result-list">
            ${data.questions.map((q,i)=>`
              <article class="student-quiz-result-question">
                <div class="student-quiz-result-head">
                  <div><small>السؤال ${i+1}</small><h3>${esc(q.prompt)}</h3></div>
                  <span>${esc(q.answer?.awardedMarks ?? '—')} / ${esc(q.marks)}</span>
                </div>
                ${listeningAudio(q)}
                <p><b>إجابتك:</b> ${esc(resultAnswerText(q))}</p>
                ${q.answer?.needsManualReview?'<div class="academy-note">بانتظار تصحيح المدرب.</div>':''}
                ${q.answer?.feedback?'<div class="academy-note">تعليق المدرب: '+esc(q.answer.feedback)+'</div>':''}
                ${data.quiz.showCorrectAnswers && q.correctAnswer
                  ? '<div class="student-quiz-correct"><b>الإجابة الصحيحة:</b> '+esc(correctText(q))+(q.explanation?'<p>'+esc(q.explanation)+'</p>':'')+'</div>'
                  : ''}
              </article>
            `).join('')}
          </div>
        </section>
      `;
    }catch(err){
      target.innerHTML='<div class="student-card student-empty">'+esc(err.message)+'</div>';
    }
  }

  async function renderQuizPage(){
    const params=new URLSearchParams(location.search);
    const result=params.get('result');
    const attempt=params.get('attempt');

    try{
      if(result)return renderResult(await trustedAttemptId(result));
      if(attempt)return renderAttempt(await trustedAttemptId(attempt));
    }catch(err){
      document.getElementById('studentPageContent').innerHTML=
        '<div class="student-card student-empty">'+esc(err.message)+'</div>';
      return;
    }

    document.getElementById('studentPageContent').innerHTML='<div class="student-card student-empty">لم يتم تحديد محاولة.</div>';
  }

  return { renderList, renderQuizPage };
})();