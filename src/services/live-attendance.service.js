const LiveAttendance = require('../models/LiveAttendance');
const CompensationProgress = require('../models/CompensationProgress');

function lateInfo(session, joinedAt) {
  const start = new Date(session.startAt).getTime();
  const joined = new Date(joinedAt).getTime();
  const threshold = Number(session.lateAfterMinutes || 0) * 60 * 1000;

  if (joined <= start + threshold) {
    return { attendanceStatus: 'present', lateMinutes: 0 };
  }

  return {
    attendanceStatus: 'late',
    lateMinutes: Math.max(1, Math.ceil((joined - start) / 60000))
  };
}

async function getOrCreate({
  academyId,
  session,
  studentId,
  courseId,
  groupId = null
}) {
  let row = await LiveAttendance.findOne({
    academyId,
    liveSessionId: session._id,
    studentId
  });

  if (!row) {
    row = new LiveAttendance({
      academyId,
      liveSessionId: session._id,
      studentId,
      courseId,
      groupId
    });
  }

  return row;
}

async function recordPortalJoin({
  academyId,
  session,
  studentId,
  courseId,
  groupId = null,
  at = new Date()
}) {
  const row = await getOrCreate({
    academyId,
    session,
    studentId,
    courseId,
    groupId
  });

  if (!row.firstPortalAt) row.firstPortalAt = at;
  row.lastPortalAt = at;
  row.portalJoinCount = Number(row.portalJoinCount || 0) + 1;
  row.lastEventAt = at;

  if (!row.manualOverride) {
    const info = lateInfo(session, at);
    row.attendanceStatus = info.attendanceStatus;
    row.lateMinutes = info.lateMinutes;
  }

  row.source = row.verifiedByZoom ? 'portal_zoom' : 'portal';

  await row.save();
  return row;
}

async function recordZoomJoin({
  academyId,
  session,
  studentId,
  courseId,
  groupId = null,
  participantId = '',
  at = new Date()
}) {
  const row = await getOrCreate({
    academyId,
    session,
    studentId,
    courseId,
    groupId
  });

  if (!row.firstJoinedAt || new Date(at) < row.firstJoinedAt) {
    row.firstJoinedAt = at;
  }

  row.lastJoinedAt = at;
  row.leftAt = null;
  row.zoomJoinCount = Number(row.zoomJoinCount || 0) + 1;
  row.verifiedByZoom = true;
  row.lastEventAt = at;
  row.source = row.firstPortalAt ? 'portal_zoom' : 'zoom';

  if (participantId) {
    const ids = new Set((row.zoomParticipantIds || []).map(String));
    ids.add(String(participantId));
    row.zoomParticipantIds = [...ids];
    row.lastZoomParticipantId = String(participantId);
  }

  if (!row.manualOverride) {
    const info = lateInfo(session, at);
    row.attendanceStatus = info.attendanceStatus;
    row.lateMinutes = info.lateMinutes;
  }

  await row.save();

  await CompensationProgress.deleteMany({
    academyId,
    liveSessionId: session._id,
    studentId,
    status: 'pending'
  });

  return row;
}

async function recordZoomLeave({
  row,
  at = new Date()
}) {
  if (!row) return null;

  if (row.lastJoinedAt) {
    const start = new Date(row.lastJoinedAt).getTime();
    const end = new Date(at).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      row.totalDurationSeconds =
        Number(row.totalDurationSeconds || 0) +
        Math.floor((end - start) / 1000);
    }
  }

  row.leftAt = at;
  row.lastEventAt = at;
  row.verifiedByZoom = true;
  row.source = row.firstPortalAt ? 'portal_zoom' : 'zoom';

  await row.save();
  return row;
}

function serialize(row) {
  if (!row) return null;

  return {
    id: row._id,
    attendanceStatus: row.attendanceStatus,
    lateMinutes: row.lateMinutes,
    firstPortalAt: row.firstPortalAt,
    lastPortalAt: row.lastPortalAt,
    portalJoinCount: row.portalJoinCount,
    firstJoinedAt: row.firstJoinedAt,
    lastJoinedAt: row.lastJoinedAt,
    leftAt: row.leftAt,
    totalDurationSeconds: row.totalDurationSeconds,
    zoomJoinCount: row.zoomJoinCount,
    verifiedByZoom: row.verifiedByZoom,
    source: row.source,
    manualOverride: row.manualOverride,
    note: row.note
  };
}

module.exports = {
  lateInfo,
  recordPortalJoin,
  recordZoomJoin,
  recordZoomLeave,
  serialize
};
