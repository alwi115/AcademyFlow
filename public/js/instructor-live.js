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
        const [rows,opts,seriesRows]=await Promise.all([
          P().api('/api/instructor/live'),
          P().getOptions(),
          P().api('/api/instructor/live-series')
        ]);

        target.innerHTML=`
          <section class="instructor-card">
            <div class="instructor-card-head">
              <div>
                <h2>المحاضرات المباشرة</h2>
                <p>أنشئ جلسة Zoom وتابع الحضور من أول دخول حتى وقت الخروج.</p>
              </div>
              <div class="instructor-actions">
                <button class="btn soft" id="liveSeriesAdd" type="button">+ جدول متكرر</button>
                <button class="btn primary" id="liveAdd" type="button">+ محاضرة</button>
              </div>
            </div>

            <div class="instructor-live-grid">
              ${rows.length?rows.map((s,i)=>`
                <article class="instructor-live-card">
                  <div class="instructor-live-head">
                    <div>
                      <span class="instructor-status ${s.status==='live'?'good':s.status==='scheduled'?'warn':'info'}">${P().esc(s.status==='live'?'مباشر':s.status==='scheduled'?'مجدولة':s.status==='ended'?'منتهية':'ملغاة')}</span>
                      <h3>${P().esc(s.title)}</h3>
                    </div>
                    <span>${P().esc(s.startAtDisplay || P().fmtDate(s.startAt,true))}</span>
                  </div>

                  <p>${P().esc(s.course?.title||'')} ${s.group?.name?'· '+P().esc(s.group.name):'· كل المجموعات'} · ${P().esc(s.durationMinutes)} دقيقة</p>

                  <div class="instructor-meta">
                    <span>التأخير بعد ${P().esc(s.lateAfterMinutes)} د</span>
                    <span>فتح الدخول قبل ${P().esc(s.joinWindowBeforeMinutes)} د</span>
                    <span>${s.attendanceEnabled?'التحضير مفعل':'التحضير متوقف'}</span>
                    <span>${s.zoomReady?'Zoom جاهز':'Zoom غير مربوط'}</span>
                    <span>تذكير قبل ${P().esc(s.reminderMinutes ?? 5)} د</span>
                    ${s.reminderCompletedAt
                      ? '<span>الموقع '+P().esc(s.reminderStats?.inApp || 0)+' · Email '+P().esc(s.reminderStats?.email || 0)+(Number(s.reminderStats?.emailFailed || 0)?' · فشل '+P().esc(s.reminderStats.emailFailed):'')+'</span>'
                      : '<span>التذكير لم يُرسل بعد</span>'}
                    ${s.series?'<span>جدول متكرر</span>':''}
                  </div>

                  <div class="instructor-actions" style="margin-top:11px">
                    <button class="btn soft live-details" data-index="${i}" type="button">تفاصيل</button>
                    <button class="btn soft live-edit" data-index="${i}" type="button">تعديل</button>
                    ${s.status!=='cancelled'?'<button class="btn soft live-extend" data-index="'+i+'" type="button">تمديد</button>':''}
                    <button class="btn ${s.status==='cancelled'?'primary':'ghost'} live-status" data-index="${i}" data-next="${s.status==='cancelled'?'scheduled':'cancelled'}" type="button">${s.status==='cancelled'?'إعادة الجدولة':'إلغاء'}</button>
                    ${!s.zoomReady && s.status==='scheduled'?'<button class="btn soft live-reconnect" data-index="'+i+'" type="button">إنشاء رابط Zoom</button>':''}
                    <button class="btn primary live-start" data-index="${i}" type="button" ${!s.hostReady||s.status==='cancelled'?'disabled':''}>بدء Zoom</button>
                    <button class="btn soft live-attendance" data-index="${i}" type="button">سجل الحضور</button>
                  </div>
                </article>
              `).join(''):'<div class="instructor-empty">لا توجد محاضرات بعد.</div>'}
            </div>
          </section>

          <section class="instructor-card instructor-section">
            <div class="instructor-card-head">
              <div>
                <h2>الجداول المتكررة</h2>
                <p>أنشئ كل حصص الأحد/الثلاثاء أو أي أيام أخرى دفعة واحدة.</p>
              </div>
            </div>
            <div class="instructor-list">
              ${seriesRows.length?seriesRows.map((s,i)=>`
                <div class="instructor-list-row">
                  <div>
                    <b>${P().esc(s.title)}</b>
                    <span>${P().esc(s.courseId?.title||'')} ${s.groupId?.name?'· '+P().esc(s.groupId.name):'· كل المجموعات'} · ${weekdayText(s.weekdays)} · ${P().esc(s.time)} · ${P().esc(s.sessionCount)} حصة</span>
                    <small>${P().esc(s.startDate)} → ${P().esc(s.endDate)} · تذكير قبل ${P().esc(s.reminderMinutes)} د</small>
                  </div>
                  <div class="instructor-actions">
                    ${P().status(s.status)}
                    ${s.status==='active'?'<button class="btn ghost series-cancel" data-index="'+i+'" type="button">إلغاء الحصص القادمة</button>':''}
                  </div>
                </div>
              `).join(''):'<div class="instructor-empty">لا توجد جداول متكررة بعد.</div>'}
            </div>
          </section>`;

        document.getElementById('liveAdd').onclick=()=>openCreate(opts,load);
        document.getElementById('liveSeriesAdd').onclick=()=>openSeries(opts,load);

        document.querySelectorAll('.series-cancel').forEach(btn=>{
          btn.onclick=()=>cancelSeries(seriesRows[Number(btn.dataset.index)],load);
        });

        document.querySelectorAll('.live-start').forEach(btn=>{
          btn.onclick=()=>startSession(rows[Number(btn.dataset.index)]);
        });

        document.querySelectorAll('.live-reconnect').forEach(btn=>{
          btn.onclick=async()=>{
            const session=rows[Number(btn.dataset.index)];
            btn.disabled=true;
            try{
              const updated=await P().api('/api/instructor/live/'+encodeURIComponent(session.id),{
                method:'PATCH',
                body:JSON.stringify({})
              });
              if(updated.zoomReady){
                P().toast('تم إنشاء رابط Zoom');
              }else{
                P().toast('تكامل Zoom غير مفعل في إعدادات السيرفر','error');
              }
              await load();
            }catch(err){
              P().toast(err.message,'error');
              btn.disabled=false;
            }
          };
        });

        document.querySelectorAll('.live-attendance').forEach(btn=>{
          btn.onclick=()=>openAttendance(rows[Number(btn.dataset.index)],load);
        });

        document.querySelectorAll('.live-details').forEach(btn=>{
          btn.onclick=()=>openSessionDetails(rows[Number(btn.dataset.index)]);
        });

        document.querySelectorAll('.live-edit').forEach(btn=>{
          btn.onclick=()=>openCreate(opts,load,rows[Number(btn.dataset.index)]);
        });

        document.querySelectorAll('.live-extend').forEach(btn=>{
          btn.onclick=()=>extendSession(rows[Number(btn.dataset.index)],load);
        });

        document.querySelectorAll('.live-status').forEach(btn=>{
          btn.onclick=()=>changeSessionStatus(
            rows[Number(btn.dataset.index)],
            btn.dataset.next,
            load
          );
        });
      }catch(err){
        target.innerHTML='<div class="instructor-card instructor-empty">'+P().esc(err.message)+'</div>';
      }
    };

    await load();
  }

  const dayNames=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

  function weekdayText(days){
    return (days||[]).map(x=>dayNames[Number(x)]||x).join('، ');
  }

  function groupOptions(opts){
    const courseMap=new Map((opts.courses||[]).map(c=>[String(c._id),c.title]));
    return (opts.groups||[]).map(g=>[
      g._id,
      g.name+' · '+(courseMap.get(String(g.courseId))||'دورة')
    ]);
  }

  function openSeries(opts,onDone){
    const modal=document.getElementById('instructorModal');
    const form=document.getElementById('instructorModalForm');
    document.getElementById('instructorModalTitle').textContent='جدول محاضرات متكرر';
    document.getElementById('instructorModalSubtitle').textContent='حدد الأيام والوقت والمدة، وسيتم إنشاء كل الحصص تلقائيًا.';

    form.innerHTML=`
      <div class="field"><label>الدورة</label><select name="courseId" id="seriesCourse" required>
        <option value="">اختر الدورة...</option>
        ${opts.courses.map(c=>'<option value="'+P().esc(c._id)+'">'+P().esc(c.title)+'</option>').join('')}
      </select></div>
      <div class="field"><label>المجموعة</label><select name="groupId" id="seriesGroup">
        <option value="">كل المجموعات</option>
      </select></div>
      <div class="field full"><label>عنوان المحاضرات</label><input name="title" required placeholder="مثال: أساسيات البرمجة"></div>
      <div class="field"><label>تاريخ البداية</label><input name="startDate" type="date" required></div>
      <div class="field"><label>تاريخ النهاية</label><input name="endDate" type="date" required></div>
      <div class="field"><label>وقت الحصة</label><input name="time" type="time" required></div>
      <div class="field"><label>مدة الحصة بالدقائق</label><input name="durationMinutes" type="number" min="1" value="60" required></div>

      <div class="full instructor-note">
        <b>أيام الحصص</b>
        <div class="instructor-weekdays" id="seriesWeekdays">
          ${dayNames.map((name,index)=>'<label><input type="checkbox" value="'+index+'"><span>'+P().esc(name)+'</span></label>').join('')}
        </div>
      </div>

      <div class="field"><label>يعتبر متأخر بعد</label><input name="lateAfterMinutes" type="number" min="0" value="10"></div>
      <div class="field"><label>فتح الدخول قبل</label><input name="joinWindowBeforeMinutes" type="number" min="0" value="15"></div>
      <div class="field"><label>التذكير قبل (دقائق)</label><input name="reminderMinutes" type="number" min="0" max="1440" value="5"></div>
      <div class="field full"><label>الوصف</label><textarea name="description"></textarea></div>
      <label class="instructor-note full"><input name="attendanceEnabled" type="checkbox" checked> تفعيل التحضير التلقائي</label>
      <label class="instructor-note full"><input name="notifyInApp" type="checkbox" checked> تنبيه داخل AcademyFlow</label>
      <label class="instructor-note full"><input name="notifyEmail" type="checkbox" checked> تذكير عبر البريد الإلكتروني</label>

      <div class="instructor-form-message" id="seriesMessage"></div>
      <div class="instructor-form-actions">
        <button class="btn ghost" id="seriesCancel" type="button">إلغاء</button>
        <button class="btn primary" type="submit">إنشاء الجدول</button>
      </div>
    `;

    modal.hidden=false;
    document.getElementById('seriesCancel').onclick=()=>modal.hidden=true;

    const courseSelect=document.getElementById('seriesCourse');
    const groupSelect=document.getElementById('seriesGroup');

    const syncGroups=()=>{
      const courseId=courseSelect.value;
      const groups=(opts.groups||[]).filter(g=>String(g.courseId)===String(courseId));
      groupSelect.innerHTML='<option value="">كل المجموعات</option>'+
        groups.map(g=>'<option value="'+P().esc(g._id)+'">'+P().esc(g.name)+'</option>').join('');
    };
    courseSelect.onchange=syncGroups;

    form.onsubmit=async e=>{
      e.preventDefault();
      const btn=form.querySelector('button[type="submit"]');
      const msg=document.getElementById('seriesMessage');
      const data=Object.fromEntries(new FormData(form).entries());
      data.weekdays=[...document.querySelectorAll('#seriesWeekdays input:checked')].map(x=>Number(x.value));
      data.attendanceEnabled=form.elements.attendanceEnabled.checked;
      data.notifyInApp=form.elements.notifyInApp.checked;
      data.notifyEmail=form.elements.notifyEmail.checked;

      if(!data.weekdays.length){
        msg.textContent='اختر يومًا واحدًا على الأقل.';
        return;
      }

      btn.disabled=true;
      btn.textContent='جاري إنشاء الحصص...';
      msg.textContent='';

      try{
        const result=await P().api('/api/instructor/live-series',{
          method:'POST',
          body:JSON.stringify(data)
        });
        modal.hidden=true;
        P().toast('تم إنشاء '+result.createdSessions+' حصة'+(result.zoomFailures?' · '+result.zoomFailures+' بدون رابط Zoom':''));
        await onDone();
      }catch(err){
        msg.textContent=err.message;
      }finally{
        btn.disabled=false;
        btn.textContent='إنشاء الجدول';
      }
    };
  }

  async function cancelSeries(series,onDone){
    if(!confirm('إلغاء جميع الحصص القادمة في هذا الجدول؟ الحصص السابقة وسجلات الحضور لن تُحذف.'))return;

    try{
      const result=await P().api('/api/instructor/live-series/'+encodeURIComponent(series._id)+'/cancel-future',{
        method:'PATCH'
      });
      P().toast('تم إلغاء '+result.cancelled+' حصة قادمة');
      await onDone();
    }catch(err){
      P().toast(err.message,'error');
    }
  }

  function openCreate(opts,onDone,row=null){
    P().openForm({
      title:row?'تعديل المحاضرة':'محاضرة Zoom جديدة',
      subtitle:row
        ? 'يمكنك تعديل الموعد والمدة وإعدادات الحضور من نفس المكان.'
        : 'يتم إنشاء رابط الطالب ورابط المضيف تلقائيًا عند تفعيل Zoom.',
      values:row?{
        courseId:row.course?._id||row.course,
        groupId:row.group?._id||row.group||'',
        title:row.title,
        startAt:row.startAtLocal || P().inputDate(row.startAt,true),
        durationMinutes:row.durationMinutes,
        lateAfterMinutes:row.lateAfterMinutes,
        joinWindowBeforeMinutes:row.joinWindowBeforeMinutes,
        reminderMinutes:row.reminderMinutes ?? 5,
        description:row.description||'',
        attendanceEnabled:Boolean(row.attendanceEnabled),
        notifyInApp:row.notifyInApp !== false,
        notifyEmail:row.notifyEmail !== false
      }:{
        durationMinutes:60,
        attendanceEnabled:true,
        lateAfterMinutes:10,
        joinWindowBeforeMinutes:15,
        reminderMinutes:5,
        notifyInApp:true,
        notifyEmail:true
      },
      fields:[
        {name:'courseId',label:'الدورة',type:'select',required:true,placeholder:'اختر الدورة...',options:opts.courses.map(c=>[c._id,c.title])},
        {name:'groupId',label:'المجموعة',type:'select',placeholder:'كل المجموعات',options:groupOptions(opts)},
        {name:'title',label:'عنوان المحاضرة',required:true},
        {name:'startAt',label:'موعد البداية',type:'datetime-local',required:true},
        {name:'durationMinutes',label:'المدة بالدقائق',type:'number',required:true,min:1},
        {name:'lateAfterMinutes',label:'يعتبر متأخر بعد كم دقيقة؟',type:'number',min:0},
        {name:'joinWindowBeforeMinutes',label:'فتح زر الدخول قبل الموعد بدقائق',type:'number',min:0},
        {name:'reminderMinutes',label:'إرسال التذكير قبل (دقائق)',type:'number',min:0},
        {name:'description',label:'الوصف',type:'textarea',full:true},
        {name:'attendanceEnabled',label:'تفعيل التحضير التلقائي عند دخول الطالب من AcademyFlow',type:'checkbox',full:true},
        {name:'notifyInApp',label:'إرسال تنبيه داخل AcademyFlow',type:'checkbox',full:true},
        {name:'notifyEmail',label:'إرسال تذكير عبر البريد الإلكتروني',type:'checkbox',full:true}
      ],
      submitLabel:row?'حفظ التعديلات':'إنشاء المحاضرة',
      onSubmit:async data=>{
        await P().api(
          row?'/api/instructor/live/'+encodeURIComponent(row.id):'/api/instructor/live',
          {method:row?'PATCH':'POST',body:JSON.stringify(data)}
        );
        P().toast(row?'تم تعديل المحاضرة':'تم إنشاء المحاضرة');
        await onDone();
      }
    });
  }

  function openSessionDetails(session){
    P().openDetails({
      title:session.title,
      subtitle:'تفاصيل المحاضرة المباشرة',
      items:[
        ['الدورة',session.course?.title||'—'],
        ['المجموعة',session.group?.name||'كل المجموعات'],
        ['موعد البداية',session.startAtDisplay || P().fmtDate(session.startAt,true)],
        ['المدة',session.durationMinutes+' دقيقة'],
        ['الحالة',session.status],
        ['التحضير',session.attendanceEnabled?'مفعل':'متوقف'],
        ['التأخير بعد',session.lateAfterMinutes+' دقيقة'],
        ['فتح الدخول قبل',session.joinWindowBeforeMinutes+' دقيقة'],
        ['التذكير قبل',(session.reminderMinutes ?? 5)+' دقيقة'],
        ['تنبيه داخل النظام',session.notifyInApp!==false?'مفعل':'متوقف'],
        ['البريد الإلكتروني',session.notifyEmail!==false?'مفعل':'متوقف'],
        ['Zoom',session.zoomReady?'جاهز':'غير مربوط'],
        ['الوصف',session.description||'—']
      ]
    });
  }

  function extendSession(session,onDone){
    P().openForm({
      title:'تمديد المحاضرة',
      subtitle:'حدد المدة الجديدة كاملة بالدقائق، وستتزامن مع Zoom إذا كان مربوطًا.',
      values:{durationMinutes:session.durationMinutes},
      fields:[
        {name:'durationMinutes',label:'المدة الجديدة بالدقائق',type:'number',required:true,min:1}
      ],
      submitLabel:'حفظ التمديد',
      onSubmit:async data=>{
        await P().api(
          '/api/instructor/live/'+encodeURIComponent(session.id),
          {method:'PATCH',body:JSON.stringify(data)}
        );
        P().toast('تم تمديد المحاضرة');
        await onDone();
      }
    });
  }

  async function changeSessionStatus(session,next,onDone){
    const label=next==='cancelled'?'إلغاء المحاضرة':'إعادة جدولة المحاضرة';
    if(!confirm(label+'؟'))return;

    try{
      await P().api(
        '/api/instructor/live/'+encodeURIComponent(session.id),
        {method:'PATCH',body:JSON.stringify({status:next})}
      );
      P().toast(next==='cancelled'?'تم إلغاء المحاضرة':'تمت إعادة جدولة المحاضرة');
      await onDone();
    }catch(err){
      P().toast(err.message,'error');
    }
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
    document.getElementById('instructorModalSubtitle').textContent=data.session.title+' · '+(data.session.startAtDisplay || P().fmtDate(data.session.startAt,true));

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