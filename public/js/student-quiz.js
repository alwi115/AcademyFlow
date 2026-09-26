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

  function fmtDate(value,withTime=false){
    if(!value)return '—';
    const d=new Date(value);
    if(Number.isNaN(d.getTime()))return '—';
    return withTime
      ? d.toLocaleString('ar-OM',{dateStyle:'medium',timeStyle:'short'})
      : d.toLocaleDateString('ar-OM',{dateStyle:'medium'});
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
    const response=await fetch(url,{
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

  async function renderList(){
    clearInterval(timerId);
    const target=document.getElementById('studentPageContent');
    target.innerHTML='<div class="student-empty">جاري تحميل الاختبارات...</div>';

    try{
      const rows=await api('/api/student/quizzes');

      target.innerHTML=`
        <section class="student-card">
          <div class="student-card-head">
            <div><h2>اختبارات دوراتك</h2><p>ابدأ الاختبار عندما تكون جاهزًا. المؤقت يبدأ من لحظة بدء المحاولة.</p></div>
          </div>

          ${rows.length?'<div class="student-quiz-grid">'+rows.map((q,index)=>`
            <article class="student-quiz-card">
              <div class="student-quiz-card-head">
                <div>
                  <span class="student-quiz-course">${esc(q.course?.title||'دورة')}</span>
                  <h3>${esc(q.title)}</h3>
                </div>
                ${status(q.status)}
              </div>
              <p>${esc(q.description||'لا توجد تعليمات إضافية.')}</p>

              <div class="student-quiz-meta">
                <span>المدة <b>${esc(q.durationMinutes||0)} د</b></span>
                <span>المحاولات <b>${esc(q.attempts.length)} / ${esc(q.maxAttempts)}</b></span>
                <span>النجاح <b>${esc(q.passingPercentage)}%</b></span>
                <span>الدرجة <b>${esc(q.totalMarks)}</b></span>
              </div>

              <div class="student-quiz-date">
                <span>متاح: ${fmtDate(q.availableFrom,true)}</span>
                <span>ينتهي: ${fmtDate(q.dueAt,true)}</span>
              </div>

              <div class="student-quiz-actions">
                ${q.activeAttempt
                  ? '<a class="btn primary" href="/student/quiz.html?attempt='+encodeURIComponent(q.activeAttempt.id)+'">متابعة المحاولة</a>'
                  : q.canStart
                    ? '<button class="btn primary student-start-quiz" data-index="'+index+'" type="button">بدء الاختبار</button>'
                    : '<button class="btn ghost" type="button" disabled>غير متاح للبدء</button>'}
              </div>

              ${q.attempts.length?`
                <div class="student-quiz-history">
                  <b>المحاولات السابقة</b>
                  ${q.attempts.map(a=>`
                    <div>
                      <span>#${esc(a.attemptNumber)} · ${esc(attemptLabel(a))}</span>
                      <span>${a.status==='graded'||a.status==='pending_review'
                        ? esc(a.percentage)+'%'
                        : ''}
                        ${a.status!=='in_progress'
                          ? '<a href="/student/quiz.html?result='+encodeURIComponent(a.id)+'">النتيجة</a>'
                          : ''}
                      </span>
                    </div>
                  `).join('')}
                </div>
              `:''}
            </article>
          `).join('')+'</div>':'<div class="student-empty">لا توجد اختبارات منشورة في دوراتك حاليًا.</div>'}
        </section>
      `;

      document.querySelectorAll('.student-start-quiz').forEach(btn=>{
        btn.onclick=async()=>{
          const quiz=rows[Number(btn.dataset.index)];
          if(!confirm('سيبدأ المؤقت فور بدء المحاولة. هل تريد المتابعة؟'))return;
          btn.disabled=true;
          btn.textContent='جاري البدء...';
          try{
            const data=await api('/api/student/quizzes/'+quiz.id+'/start',{method:'POST'});
            location.href='/student/quiz.html?attempt='+encodeURIComponent(data.attempt.id);
          }catch(err){
            toast(err.message,'error');
            btn.disabled=false;
            btn.textContent='بدء الاختبار';
          }
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

  function questionInput(question,attemptId,onChanged){
    const a=question.answer||{};

    if(question.type==='multiple_choice'){
      return `
        <div class="student-quiz-options">
          ${question.options.map(option=>`
            <label class="student-quiz-option">
              <input type="radio" name="quizAnswer" value="${esc(option.id)}" ${String(a.selectedOptionId||'')===String(option.id)?'checked':''}>
              <span><i></i>${esc(option.text)}</span>
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
            <span><i></i>صح</span>
          </label>
          <label class="student-quiz-option">
            <input type="radio" name="quizBoolean" value="false" ${a.booleanAnswer===false?'checked':''}>
            <span><i></i>خطأ</span>
          </label>
        </div>
      `;
    }

    return `
      <div class="field student-quiz-text">
        <label>إجابتك</label>
        <textarea id="quizTextAnswer" maxlength="10000" placeholder="اكتب إجابتك هنا...">${esc(a.textAnswer||'')}</textarea>
        <small>يتم حفظ الإجابة تلقائيًا أثناء الكتابة.</small>
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

      let index=0;
      const questions=data.questions;
      const attempt=data.attempt;
      let seconds=attempt.remainingSeconds;
      let submitted=false;

      const draw=()=>{
        const q=questions[index];
        const answeredCount=questions.filter(answered).length;

        target.innerHTML=`
          <section class="student-quiz-exam-head">
            <div>
              <a href="/student/quizzes.html" class="student-quiz-exit">← الاختبارات</a>
              <span class="student-quiz-course">${esc(data.quiz.course?.title||'')}</span>
              <h2>${esc(data.quiz.title)}</h2>
              <p>المحاولة #${esc(attempt.attemptNumber)} · ${answeredCount} من ${questions.length} مجاب</p>
            </div>
            <div class="student-quiz-timer ${seconds!==null&&seconds<=300?'danger':''}">
              <small>الوقت المتبقي</small>
              <b id="quizTimer">${seconds===null?'بدون مؤقت':formatTime(seconds)}</b>
            </div>
          </section>

          <section class="student-quiz-exam-layout">
            <article class="student-card student-quiz-question">
              <div class="student-quiz-question-head">
                <span>السؤال ${index+1} من ${questions.length}</span>
                <b>${esc(q.marks)} درجة</b>
              </div>
              <h3>${esc(q.prompt)}</h3>
              ${questionInput(q,attemptId)}

              <div class="student-quiz-nav">
                <button class="btn ghost" id="quizPrev" type="button" ${index===0?'disabled':''}>السابق</button>
                <div class="student-quiz-save-state" id="quizSaveState">محفوظ</div>
                ${index<questions.length-1
                  ? '<button class="btn primary" id="quizNext" type="button">التالي</button>'
                  : '<button class="btn primary" id="quizSubmit" type="button">تسليم الاختبار</button>'}
              </div>
            </article>

            <aside class="student-card student-quiz-map">
              <h3>الأسئلة</h3>
              <div class="student-quiz-map-grid">
                ${questions.map((item,i)=>`
                  <button class="${i===index?'active':''} ${answered(item)?'answered':''}" data-index="${i}" type="button">${i+1}</button>
                `).join('')}
              </div>
              <div class="student-quiz-map-legend"><span><i class="answered"></i>مجاب</span><span><i></i>غير مجاب</span></div>
            </aside>
          </section>
        `;

        const setSaving=txt=>{
          const el=document.getElementById('quizSaveState');
          if(el)el.textContent=txt;
        };

        document.querySelectorAll('input[name="quizAnswer"]').forEach(input=>{
          input.onchange=async()=>{
            q.answer={...(q.answer||{}),selectedOptionId:input.value,booleanAnswer:null,textAnswer:''};
            setSaving('جاري الحفظ...');
            try{
              await saveAnswer(attemptId,q,{selectedOptionId:input.value},true);
              setSaving('تم الحفظ');
              setTimeout(draw,180);
            }catch{setSaving('تعذر الحفظ');}
          };
        });

        document.querySelectorAll('input[name="quizBoolean"]').forEach(input=>{
          input.onchange=async()=>{
            const value=input.value==='true';
            q.answer={...(q.answer||{}),booleanAnswer:value,selectedOptionId:'',textAnswer:''};
            setSaving('جاري الحفظ...');
            try{
              await saveAnswer(attemptId,q,{booleanAnswer:value},true);
              setSaving('تم الحفظ');
              setTimeout(draw,180);
            }catch{setSaving('تعذر الحفظ');}
          };
        });

        const text=document.getElementById('quizTextAnswer');
        if(text){
          text.oninput=()=>{
            q.answer={...(q.answer||{}),textAnswer:text.value,selectedOptionId:'',booleanAnswer:null};
            setSaving('جاري الحفظ...');
            clearTimeout(saveTimer);
            saveTimer=setTimeout(async()=>{
              try{
                await saveAnswer(attemptId,q,{textAnswer:text.value},true);
                setSaving('تم الحفظ');
              }catch{setSaving('تعذر الحفظ');}
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
          if(confirm('هل أنت متأكد من تسليم الاختبار؟ لن تتمكن من تعديل الإجابات بعد التسليم.')){
            submitted=true;
            submitAttempt(attemptId,false);
          }
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

    if(result)return renderResult(result);
    if(attempt)return renderAttempt(attempt);

    document.getElementById('studentPageContent').innerHTML='<div class="student-card student-empty">لم يتم تحديد محاولة.</div>';
  }

  return { renderList, renderQuizPage };
})();