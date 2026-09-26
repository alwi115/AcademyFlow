window.InstructorTeaching = (() => {
  function P(){ return window.InstructorPortal; }

  async function renderLessons(){
    const target=document.getElementById('pageContent');
    const load=async()=>{
      target.innerHTML='<div class="instructor-empty">جاري تحميل الدروس...</div>';
      try{
        const [rows,opts]=await Promise.all([P().api('/api/instructor/lessons'),P().getOptions()]);
        target.innerHTML=`
          <section class="instructor-card">
            <div class="instructor-card-head">
              <div><h2>دروس دوراتك</h2><p>أضف رابط YouTube وسيظهر للطالب داخل AcademyFlow.</p></div>
              <div class="instructor-actions">
                <select class="instructor-search" id="lessonCourseFilter"><option value="">كل الدورات</option>${opts.courses.map(c=>'<option value="'+P().esc(c._id)+'">'+P().esc(c.title)+'</option>').join('')}</select>
                <button class="btn primary" id="lessonAdd" type="button">+ درس</button>
              </div>
            </div>
            <div id="lessonRows"></div>
          </section>`;

        const draw=()=>{
          const course=document.getElementById('lessonCourseFilter').value;
          const filtered=course?rows.filter(x=>String(x.courseId?._id||x.courseId)===String(course)):rows;
          document.getElementById('lessonRows').innerHTML='<div class="instructor-table-wrap"><table class="instructor-table"><thead><tr><th>#</th><th>الدرس</th><th>الدورة</th><th>الفيديو</th><th>المدة</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>'+
          (filtered.length?filtered.map((x,i)=>'<tr><td>'+P().esc(x.order)+'</td><td><b>'+P().esc(x.title)+'</b><br><small>'+P().esc(x.description||'')+'</small></td><td>'+P().esc(x.courseId?.title||'')+'</td><td>'+(x.youtubeId?'YouTube ✓':'—')+'</td><td>'+P().esc(x.durationMinutes||0)+' د</td><td>'+P().status(x.status)+'</td><td><button class="btn soft lesson-edit" data-index="'+i+'" type="button">تعديل</button></td></tr>').join(''):'<tr><td colspan="7" class="instructor-empty">لا توجد دروس.</td></tr>')+
          '</tbody></table></div>';

          document.querySelectorAll('.lesson-edit').forEach(btn=>{
            btn.onclick=()=>openLessonForm(filtered[Number(btn.dataset.index)],opts,load);
          });
        };

        document.getElementById('lessonCourseFilter').onchange=draw;
        document.getElementById('lessonAdd').onclick=()=>openLessonForm(null,opts,load);
        draw();
      }catch(err){target.innerHTML='<div class="instructor-card instructor-empty">'+P().esc(err.message)+'</div>';}
    };
    await load();
  }

  function openLessonForm(row,opts,onDone){
    P().openForm({
      title:row?'تعديل الدرس':'درس جديد',
      values:row?{
        courseId:row.courseId?._id||row.courseId,
        title:row.title,
        description:row.description||'',
        order:row.order,
        videoUrl:row.videoUrl||'',
        durationMinutes:row.durationMinutes||0,
        status:row.status,
        isPreview:Boolean(row.isPreview)
      }:{order:1,status:'draft',durationMinutes:0},
      fields:[
        {name:'courseId',label:'الدورة',type:'select',required:true,placeholder:'اختر الدورة...',options:opts.courses.map(c=>[c._id,c.title])},
        {name:'title',label:'عنوان الدرس',required:true},
        {name:'order',label:'الترتيب',type:'number',required:true,min:1},
        {name:'durationMinutes',label:'المدة بالدقائق',type:'number',min:0},
        {name:'videoUrl',label:'رابط YouTube',type:'url',full:true},
        {name:'description',label:'الوصف',type:'textarea',full:true},
        {name:'status',label:'الحالة',type:'select',required:true,options:[['draft','مسودة'],['published','منشور']]},
        {name:'isPreview',label:'السماح بمعاينة الدرس',type:'checkbox',full:true}
      ],
      submitLabel:row?'حفظ التعديلات':'إضافة الدرس',
      onSubmit:async data=>{
        await P().api(
          row?'/api/instructor/lessons/'+row._id:'/api/instructor/lessons',
          {method:row?'PATCH':'POST',body:JSON.stringify(data)}
        );
        P().toast(row?'تم تعديل الدرس':'تمت إضافة الدرس');
        await onDone();
      }
    });
  }

  async function renderAttendance(){
    const target=document.getElementById('pageContent');
    const load=async()=>{
      target.innerHTML='<div class="instructor-empty">جاري تحميل الحضور...</div>';
      try{
        const [rows,opts]=await Promise.all([P().api('/api/instructor/attendance'),P().getOptions()]);
        target.innerHTML=`
          <section class="instructor-card">
            <div class="instructor-card-head">
              <div><h2>الحضور اليدوي</h2><p>للدروس الحضورية أو أي حالة تحتاج تسجيل يدوي. حضور Zoom موجود في صفحة المحاضرات.</p></div>
              <button class="btn primary" id="attendanceAdd" type="button">+ تسجيل حضور</button>
            </div>
            <div class="instructor-table-wrap"><table class="instructor-table"><thead><tr><th>الطالب</th><th>الدورة</th><th>المجموعة</th><th>التاريخ</th><th>الحالة</th><th>ملاحظة</th></tr></thead><tbody>
              ${rows.length?rows.map(x=>'<tr><td><b>'+P().esc(x.studentId?.name||'')+'</b></td><td>'+P().esc(x.courseId?.title||'')+'</td><td>'+P().esc(x.groupId?.name||'—')+'</td><td>'+P().fmtDate(x.date,true)+'</td><td>'+P().status(x.status)+'</td><td>'+P().esc(x.note||'—')+'</td></tr>').join(''):'<tr><td colspan="6" class="instructor-empty">لا توجد سجلات حضور.</td></tr>'}
            </tbody></table></div>
          </section>`;

        document.getElementById('attendanceAdd').onclick=()=>P().openForm({
          title:'تسجيل حضور',
          fields:[
            {name:'studentId',label:'الطالب',type:'select',required:true,placeholder:'اختر الطالب...',options:opts.students.map(s=>[s._id,s.name+' · '+s.email])},
            {name:'courseId',label:'الدورة',type:'select',required:true,placeholder:'اختر الدورة...',options:opts.courses.map(c=>[c._id,c.title])},
            {name:'date',label:'التاريخ والوقت',type:'datetime-local',required:true},
            {name:'status',label:'الحالة',type:'select',required:true,options:[['present','حاضر'],['late','متأخر'],['absent','غائب'],['excused','بعذر']]},
            {name:'note',label:'ملاحظة',type:'textarea',full:true}
          ],
          onSubmit:async data=>{
            await P().api('/api/instructor/attendance',{method:'POST',body:JSON.stringify(data)});
            P().toast('تم تسجيل الحضور');await load();
          }
        });
      }catch(err){target.innerHTML='<div class="instructor-card instructor-empty">'+P().esc(err.message)+'</div>';}
    };
    await load();
  }

  async function renderAssignments(){
    const target=document.getElementById('pageContent');
    const load=async()=>{
      target.innerHTML='<div class="instructor-empty">جاري تحميل الواجبات...</div>';
      try{
        const [rows,opts]=await Promise.all([P().api('/api/instructor/assignments'),P().getOptions()]);
        target.innerHTML=`
          <section class="instructor-card">
            <div class="instructor-card-head">
              <div><h2>الواجبات</h2><p>أنشئ الواجب ثم راجع تسليمات الطلاب وصححها.</p></div>
              <button class="btn primary" id="assignmentAdd" type="button">+ واجب</button>
            </div>
            <div class="instructor-course-grid">
              ${rows.length?rows.map((a,i)=>`
                <article class="instructor-course">
                  <div style="display:flex;justify-content:space-between;gap:8px"><span class="instructor-status ${a.status==='published'?'good':'warn'}">${P().esc(a.status==='published'?'منشور':a.status==='closed'?'مغلق':'مسودة')}</span><span>${P().esc(a.totalMarks)} درجة</span></div>
                  <h3 style="margin-top:10px">${P().esc(a.title)}</h3>
                  <p>${P().esc(a.courseId?.title||'')} · التسليم ${P().fmtDate(a.dueAt,true)}</p>
                  <div class="instructor-meta"><span>${P().esc(a.submissionCount)} تسليم</span><span>${P().esc(a.pendingCount)} تحتاج تصحيح</span><span>${P().esc(a.gradedCount)} مصححة</span></div>
                  <div class="instructor-actions" style="margin-top:10px">
                    <button class="btn soft assignment-edit" data-index="${i}" type="button">تعديل</button>
                    <button class="btn ${a.pendingCount?'primary':'soft'} assignment-open" data-index="${i}" type="button">عرض التسليمات</button>
                  </div>
                </article>
              `).join(''):'<div class="instructor-empty">لا توجد واجبات.</div>'}
            </div>
          </section>`;

        document.getElementById('assignmentAdd').onclick=()=>openAssignmentForm(opts,load);
        document.querySelectorAll('.assignment-open').forEach(btn=>{
          btn.onclick=()=>openSubmissions(rows[Number(btn.dataset.index)],load);
        });
        document.querySelectorAll('.assignment-edit').forEach(btn=>{
          btn.onclick=()=>openAssignmentForm(opts,load,rows[Number(btn.dataset.index)]);
        });
      }catch(err){target.innerHTML='<div class="instructor-card instructor-empty">'+P().esc(err.message)+'</div>';}
    };
    await load();
  }

  function openAssignmentForm(opts,onDone,row=null){
    P().openForm({
      title:row?'تعديل الواجب':'واجب جديد',
      fields:[
        {name:'courseId',label:'الدورة',type:'select',required:true,placeholder:'اختر الدورة...',options:opts.courses.map(c=>[c._id,c.title])},
        {name:'title',label:'عنوان الواجب',required:true},
        {name:'dueAt',label:'آخر موعد',type:'datetime-local'},
        {name:'totalMarks',label:'الدرجة',type:'number',min:1},
        {name:'passingMark',label:'درجة النجاح',type:'number',min:0},
        {name:'status',label:'الحالة',type:'select',required:true,options:[['draft','مسودة'],['published','منشور'],['closed','مغلق']]},
        {name:'description',label:'التعليمات',type:'textarea',full:true}
      ],
      values:row?{
        courseId:row.courseId?._id||row.courseId,
        title:row.title,
        dueAt:row.dueAt?new Date(new Date(row.dueAt).getTime()-new Date(row.dueAt).getTimezoneOffset()*60000).toISOString().slice(0,16):'',
        totalMarks:row.totalMarks,
        passingMark:row.passingMark,
        status:row.status,
        description:row.description||''
      }:{totalMarks:100,passingMark:50,status:'draft'},
      submitLabel:row?'حفظ التعديلات':'إنشاء الواجب',
      onSubmit:async data=>{
        await P().api(row?'/api/instructor/assignments/'+row._id:'/api/instructor/assignments',{method:row?'PATCH':'POST',body:JSON.stringify(data)});
        P().toast(row?'تم تعديل الواجب':'تم إنشاء الواجب');await onDone();
      }
    });
  }

  async function openSubmissions(assignment,onDone){
    const data=await P().api('/api/instructor/assignments/'+assignment._id+'/submissions');
    const modal=document.getElementById('instructorModal');
    const form=document.getElementById('instructorModalForm');
    document.getElementById('instructorModalTitle').textContent='تسليمات الواجب';
    document.getElementById('instructorModalSubtitle').textContent=assignment.title;

    form.innerHTML='<div class="full instructor-table-wrap"><table class="instructor-table"><thead><tr><th>الطالب</th><th>التسليم</th><th>الحالة</th><th>الدرجة</th><th>إجراء</th></tr></thead><tbody>'+
      (data.rows.length?data.rows.map((s,i)=>'<tr><td><b>'+P().esc(s.studentId?.name||'')+'</b><br><small>'+P().esc(s.studentId?.email||'')+'</small></td><td>'+P().fmtDate(s.submittedAt,true)+'</td><td>'+P().status(s.status)+'</td><td>'+P().esc(s.score??'—')+' / '+P().esc(assignment.totalMarks)+'</td><td><button class="btn '+(s.status==='submitted'?'primary':'soft')+' grade-submission" data-index="'+i+'" type="button">'+(s.status==='submitted'?'تصحيح':'مراجعة')+'</button></td></tr>').join(''):'<tr><td colspan="5" class="instructor-empty">لا توجد تسليمات.</td></tr>')+
      '</tbody></table></div><div class="instructor-form-actions"><button class="btn ghost" id="submissionClose" type="button">إغلاق</button></div>';

    modal.hidden=false;
    document.getElementById('submissionClose').onclick=()=>modal.hidden=true;
    form.onsubmit=e=>e.preventDefault();

    document.querySelectorAll('.grade-submission').forEach(btn=>{
      btn.onclick=()=>openGradeSubmission(assignment,data.rows[Number(btn.dataset.index)],async()=>{
        await onDone();
      });
    });
  }

  function openGradeSubmission(assignment,submission,onDone){
    P().openForm({
      title:'تصحيح الواجب',
      subtitle:submission.studentId?.name||'طالب',
      values:{score:submission.score??'',feedback:submission.feedback||''},
      fields:[
        {name:'score',label:'الدرجة من '+assignment.totalMarks,type:'number',required:true,min:0,max:assignment.totalMarks},
        {name:'feedback',label:'تعليق للطالب',type:'textarea',full:true}
      ],
      submitLabel:'حفظ التصحيح',
      onSubmit:async data=>{
        await P().api('/api/instructor/assignments/'+assignment._id+'/submissions/'+submission._id,{method:'PATCH',body:JSON.stringify(data)});
        P().toast('تم حفظ التصحيح');await onDone();
      }
    });
  }

  return {renderLessons,renderAttendance,renderAssignments};
})();