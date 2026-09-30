const LiveSeries = require('../models/LiveSeries');
const LiveSession = require('../models/LiveSession');
const zoom = require('./zoom.service');
const Academy = require('../models/Academy');
const { safeTimeZone, zonedLocalToUtc } = require('./timezone.service');

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function dateStringsBetween(startDate, endDate) {
  const [sy,sm,sd] = String(startDate).split('-').map(Number);
  const [ey,em,ed] = String(endDate).split('-').map(Number);

  const start = new Date(Date.UTC(sy, sm - 1, sd, 12));
  const end = new Date(Date.UTC(ey, em - 1, ed, 12));

  if ([start.getTime(), end.getTime()].some(Number.isNaN) || end < start) {
    throw badRequest('تاريخ نهاية الجدول يجب أن يكون بعد تاريخ البداية');
  }

  const out = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    out.push(cursor.toISOString().slice(0,10));
    if (out.length > 370) break;
  }
  return out;
}

function validateWeekdays(weekdays) {
  const values = [...new Set(
    (Array.isArray(weekdays) ? weekdays : [])
      .map(Number)
      .filter(x => Number.isInteger(x) && x >= 0 && x <= 6)
  )];

  if (!values.length) {
    const err = new Error('اختر يومًا واحدًا على الأقل');
    err.status = 400;
    throw err;
  }

  return values.sort((a,b) => a-b);
}

async function createRecurringSeries({
  academy,
  course,
  group = null,
  instructorId,
  body
}) {
  const weekdays = validateWeekdays(body.weekdays);
  const timezone = safeTimeZone(academy.timezone || 'Asia/Muscat');
  const dates = dateStringsBetween(body.startDate, body.endDate)
    .filter(dateString => {
      const [y,m,d] = dateString.split('-').map(Number);
      return weekdays.includes(new Date(Date.UTC(y,m-1,d,12)).getUTCDay());
    });

  if (!dates.length) {
    const err = new Error('لا توجد أيام مطابقة داخل المدة المحددة');
    err.status = 400;
    throw err;
  }

  if (dates.length > 200) {
    const err = new Error('الجدول كبير جدًا. الحد الأقصى 200 حصة في العملية الواحدة');
    err.status = 400;
    throw err;
  }

  // Validate the local clock before writing the series document.
  zonedLocalToUtc(dates[0], body.time, timezone);

  const durationMinutes = Math.max(1, Number(body.durationMinutes || 60));
  const reminderMinutes = Math.max(0, Math.min(1440, Number(body.reminderMinutes ?? 5)));

  const series = await LiveSeries.create({
    academyId: academy._id,
    courseId: course._id,
    groupId: group?._id || null,
    instructorId,
    title: String(body.title || course.title || 'محاضرة').trim(),
    description: String(body.description || '').trim(),
    startDate: body.startDate,
    endDate: body.endDate,
    weekdays,
    time: body.time,
    timezone,
    durationMinutes,
    attendanceEnabled: body.attendanceEnabled !== false,
    lateAfterMinutes: Math.max(0, Number(body.lateAfterMinutes ?? 10)),
    joinWindowBeforeMinutes: Math.max(0, Number(body.joinWindowBeforeMinutes ?? 15)),
    reminderMinutes,
    notifyInApp: body.notifyInApp !== false,
    notifyEmail: body.notifyEmail !== false,
    sessionCount: dates.length
  });

  const sessions = [];
  let zoomFailures = 0;

  for (let index = 0; index < dates.length; index++) {
    const startAt = zonedLocalToUtc(dates[index], body.time, timezone);
    const title = dates.length > 1
      ? `${series.title} · الحصة ${index + 1}`
      : series.title;

    const row = await LiveSession.create({
      academyId: academy._id,
      courseId: course._id,
      groupId: group?._id || null,
      seriesId: series._id,
      sequenceNumber: index + 1,
      title,
      description: series.description,
      instructorId,
      startAt,
      durationMinutes,
      attendanceEnabled: series.attendanceEnabled,
      lateAfterMinutes: series.lateAfterMinutes,
      joinWindowBeforeMinutes: series.joinWindowBeforeMinutes,
      reminderMinutes,
      notifyInApp: series.notifyInApp,
      notifyEmail: series.notifyEmail
    });

    if (zoom.configured() && zoom.isConnected(academy)) {
      try {
        const meeting = await zoom.createMeeting(academy, {
          topic: title,
          startTime: startAt,
          duration: durationMinutes,
          timezone
        });

        row.zoomMeetingId = meeting.meetingId;
        row.zoomJoinUrl = meeting.joinUrl;
        row.zoomStartUrl = meeting.startUrl;
        row.zoomPassword = meeting.password;
        row.zoomProvisionError = '';
        await row.save();
      } catch (err) {
        zoomFailures += 1;
        row.zoomProvisionError = String(err.message || 'Zoom provisioning failed').slice(0,1000);
        await row.save();
      }
    }

    sessions.push(row);
  }

  return { series, sessions, zoomFailures };
}

async function cancelFutureSeries({ series, from = new Date() }) {
  const academy = await Academy.findById(series.academyId)
    .select('zoomIntegration.connected');

  const rows = await LiveSession.find({
    academyId: series.academyId,
    seriesId: series._id,
    startAt: { $gte: from },
    status: { $in: ['scheduled','live'] }
  });

  let cancelled = 0;

  for (const row of rows) {
    try {
      await zoom.deleteMeeting(academy, row.zoomMeetingId);
    } catch (err) {
      console.error('[live-series cancel zoom]', err.message);
    }

    row.status = 'cancelled';
    row.zoomMeetingId = '';
    row.zoomJoinUrl = '';
    row.zoomStartUrl = '';
    row.zoomPassword = '';
    await row.save();
    cancelled += 1;
  }

  series.status = 'cancelled';
  await series.save();

  return cancelled;
}

module.exports = {
  zonedLocalToUtc,
  createRecurringSeries,
  cancelFutureSeries
};
