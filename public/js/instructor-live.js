window.InstructorLive = (() => {
  function P(){ return window.InstructorPortal; }

  function attendanceLabel(value){
    return ({
      present:'حاضر',
      late:'متأخر',
      absent:'غائب',
      excused:'بعذر'
    })[value] || value;
  }

  async function render(){
    const target=document.getElementById('pageContent');

    const load=async()=>{
      target.innerHTML='<div class="instructor-empty">جاري تحميل المحاضرات...</div>';

      try{
        const [rows,opts]=await Promise.all([
          P().api('/api/instructor/live'),
          P().getOptions()
        ]);

        target.innerHTML=`
          <section class="instructor-card">
            <div class="instructor-card-head">
              <div>
                <h2>المحاضرات المباشرة</h2>
                <p>أنشئ جلسة Zoom وتابع الحضور من أول دخول حتى وقت الخروج.</p>
              </div>
              <button class="btn primary" id="liveAdd" type="button">+ محاضرة</button>
            </div>

            <div class="instructor-live-grid">
              ${rows.length?rows.map((s,i)=>`
                <article class="instructor-live-card">
                  <div class="instructor-live-head">
                    <div>
                      <span class="instructor-status ${s.status==='live'?'good':s.status==='scheduled'?'warn':'info'}">${P().esc(s.status==='live'?'مباشر':s.status==='scheduled'?'مجدولة':s.status==='ended'?'منتهية':'ملغاة')}</span>
                      <h3>${P().esc(s.title)}</h3>
                    </div>
                    <span>${P().fmtDate(s.startAt,true)}</span>
                  </div>

                  <p>${P().esc(s.course?.title||'')} · ${P().esc(s.durationMinutes)} دقيقة</p>

                  <div class="instructor-meta">
                    <span>التأخير بعد ${P().esc(s.lateAfterMinutes)} د</span>
                    <span>فتح الدخول قبل ${P().esc(s.joinWindowBeforeMinutes)} د</span>
                    <span>${s.attendanceEnabled?'التحضير مفعل':'التحضير متوقف'}</span>
                    <span>${s.zoomReady?'Zoom جاهز':'Zoom غير مربوط'}</span>
                  </div>

                  <div class="instructor-actions" style="margin-top:11px">
                    <button class="btn primary live-start" data-index="${i}" type="button" ${!s.hostReady?'disabled':''}>بدء Zoom</button>
                    <button class="btn soft live-attendance" data-index="${i}" type="button">سجل الحضور</button>
                  </div>
                </article>
              `).join(''):'<div class="instructor-empty">لا توجد محاضرات بعد.</div>'}
            </div>
          </section>`;

        document.getElementById('liveAdd').onclick=()=>openCreate(opts,load);

        document.querySelectorAll('.live-start').forEach(btn=>{
          btn.onclick=()=>startSession(rows[Number(btn.dataset.index)]);
        });

        document.querySelectorAll('.live-attendance').forEach(btn=>{
          btn.onclick=()=>openAttendance(rows[Number(btn.dataset.index)],load);
        });
      }catch(err){
        target.innerHTML='<div class="instructor-card instructor-empty">'+P().esc(err.message)+'</div>';
      }
    };

    await load();
  }

  function openCreate(opts,onDone){
    P().openForm({
      title:'محاضرة Zoom جديدة',
      subtitle:'يتم إنشاء رابط الطالب ورابط المضيف تلقائيًا عند تفعيل Zoom.',
      values:{
        durationMinutes:60,
        attendanceEnabled:true,
        lateAfterMinutes:10,
        joinWindowBeforeMinutes:15
      },
      fields:[
        {name:'courseId',label:'الدورة',type:'select',required:true,placeholder:'اختر الدورة...',options:opts.courses.map(c=>[c._id,c.title])},
        {name:'title',label:'عنوان المحاضرة',required:true},
        {name:'startAt',label:'موعد البداية',type:'datetime-local',required:true},
        {name:'durationMinutes',label:'المدة بالدقائق',type:'number',required:true,min:1},
        {name:'lateAfterMinutes',label:'يعتبر متأخر بعد كم دقيقة؟',type:'number',min:0},
        {name:'joinWindowBeforeMinutes',label:'فتح زر الدخول قبل الموعد بدقائق',type:'number',min:0},
        {name:'description',label:'الوصف',type:'textarea',full:true},
        {name:'attendanceEnabled',label:'تفعيل التحضير التلقائي عند دخول الطالب من AcademyFlow',type:'checkbox',full:true}
      ],
      submitLabel:'إنشاء المحاضرة',
      onSubmit:async data=>{
        await P().api('/api/instructor/live',{method:'POST',body:JSON.stringify(data)});
        P().toast('تم إنشاء المحاضرة');
        await onDone();
      }
    });
  }

  async function startSession(session){
    const popup=window.open('about:blank','_blank');
    try{
      const data=await P().api('/api/instructor/live/'+encodeURIComponent(session.id)+'/start');
      if(popup) popup.location.href=data.startUrl;
      else location.href=data.startUrl;
    }catch(err){
      if(popup) popup.close();
      P().toast(err.message,'error');
    }
  }

  function summary(rows){
    const counts={present:0,late:0,absent:0,excused:0};
    rows.forEach(r=>{if(counts[r.attendanceStatus]!==undefined)counts[r.attendanceStatus]++;});
    return counts;
  }

  async function openAttendance(session,onDone){
    const data=await P().api('/api/instructor/live/'+encodeURIComponent(session.id)+'/attendance');
    const modal=document.getElementById('instructorModal');
    const form=document.getElementById('instructorModalForm');
    const counts=summary(data.rows);

    document.getElementById('instructorModalTitle').textContent='سجل حضور المحاضرة';
    document.getElementById('instructorModalSubtitle').textContent=data.session.title+' · '+P().fmtDate(data.session.startAt,true);

    form.innerHTML=`
      <div class="full instructor-attendance-summary">
        <span>حاضر<b>${counts.present}</b></span>
        <span>متأخر<b>${counts.late}</b></span>
        <span>غائب<b>${counts.absent}</b></span>
        <span>بعذر<b>${counts.excused}</b></span>
      </div>

      <div class="full instructor-note">
        <b>طريقة القراءة:</b> "تم التحقق بواسطة Zoom" يعني أن Zoom Webhook أكد دخول الطالب فعليًا.
        أما "دخول عبر البوابة" فيعني أن الطالب ضغط زر الدخول من AcademyFlow وتم تسجيل وقت انتقاله إلى Zoom.
      </div>

      <div class="full instructor-table-wrap" style="margin-top:10px">
        <table class="instructor-table">
          <thead>
            <tr>
              <th>الطالب</th>
              <th>الحالة</th>
              <th>أول دخول</th>
              <th>التأخير</th>
              <th>إعادات الدخول</th>
              <th>المدة</th>
              <th>المصدر</th>
              <th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            ${data.rows.length?data.rows.map((r,i)=>`
              <tr>
                <td><b>${P().esc(r.student?.name||'')}</b><br><small>${P().esc(r.student?.email||'')}</small></td>
                <td>${P().status(r.attendanceStatus)}</td>
                <td>${P().fmtDate(r.firstJoinedAt||r.firstPortalAt,true)}</td>
                <td>${r.lateMinutes?P().esc(r.lateMinutes)+' د':'—'}</td>
                <td>${P().esc(Math.max(r.zoomJoinCount||0,r.portalJoinCount||0))}</td>
                <td>${P().fmtDuration(r.totalDurationSeconds)}</td>
                <td>${r.verifiedByZoom?'<span class="instructor-verified">تم التحقق بواسطة Zoom</span>':r.firstPortalAt?'دخول عبر البوابة':'—'}</td>
                <td><button class="btn soft edit-live-attendance" data-index="${i}" type="button">تعديل</button></td>
              </tr>
            `).join(''):'<tr><td colspan="8" class="instructor-empty">لا يوجد طلاب في هذه الدورة.</td></tr>'}
          </tbody>
        </table>
      </div>

      <div class="instructor-form-actions full">
        <button class="btn ghost" id="liveAttendanceClose" type="button">إغلاق</button>
      </div>
    `;

    modal.hidden=false;
    document.getElementById('liveAttendanceClose').onclick=()=>modal.hidden=true;
    form.onsubmit=e=>e.preventDefault();

    document.querySelectorAll('.edit-live-attendance').forEach(btn=>{
      btn.onclick=()=>editAttendance(session,data.rows[Number(btn.dataset.index)],async()=>{
        await openAttendance(session,onDone);
      });
    });
  }

  function editAttendance(session,row,onDone){
    P().openForm({
      title:'تعديل الحضور',
      subtitle:row.student?.name||'طالب',
      values:{
        attendanceStatus:row.attendanceStatus,
        lateMinutes:row.lateMinutes||0,
        note:row.note||''
      },
      fields:[
        {name:'attendanceStatus',label:'الحالة',type:'select',required:true,options:[
          ['present','حاضر'],
          ['late','متأخر'],
          ['absent','غائب'],
          ['excused','بعذر']
        ]},
        {name:'lateMinutes',label:'دقائق التأخير',type:'number',min:0},
        {name:'note',label:'ملاحظة',type:'textarea',full:true}
      ],
      submitLabel:'حفظ الحضور',
      onSubmit:async data=>{
        await P().api(
          '/api/instructor/live/'+encodeURIComponent(session.id)+'/attendance/'+encodeURIComponent(row.student._id),
          {method:'PATCH',body:JSON.stringify(data)}
        );
        P().toast('تم تحديث الحضور');
        await onDone();
      }
    });
  }

  return {render};
})();