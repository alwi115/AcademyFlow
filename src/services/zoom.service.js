const ZOOM_API = 'https://api.zoom.us/v2';

function configured() {
  return Boolean(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);
}

async function getAccessToken() {
  if (!configured()) throw new Error('Zoom integration is not configured');

  const basic = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString('base64');

  const url =
    'https://zoom.us/oauth/token?grant_type=account_credentials&account_id=' +
    encodeURIComponent(process.env.ZOOM_ACCOUNT_ID);

  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}` }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.reason || data.message || 'Failed to get Zoom access token');
  }

  return data.access_token;
}

async function createMeeting({ topic, startTime, duration = 60, timezone = 'Asia/Muscat' }) {
  const token = await getAccessToken();
  const userId = process.env.ZOOM_USER_ID || 'me';

  const response = await fetch(
    `${ZOOM_API}/users/${encodeURIComponent(userId)}/meetings`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        topic,
        type: 2,
        start_time: new Date(startTime).toISOString(),
        duration,
        timezone,
        settings: {
          waiting_room: true,
          join_before_host: false,
          mute_upon_entry: true
        }
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Failed to create Zoom meeting');
  }

  return {
    meetingId: String(data.id),
    joinUrl: data.join_url,
    startUrl: data.start_url,
    password: data.password || ''
  };
}

async function updateMeeting(meetingId, {
  topic,
  startTime,
  duration,
  timezone = 'Asia/Muscat'
} = {}) {
  if (!meetingId || !configured()) return;

  const token = await getAccessToken();
  const payload = {};

  if (topic !== undefined) payload.topic = topic;
  if (startTime !== undefined) payload.start_time = new Date(startTime).toISOString();
  if (duration !== undefined) payload.duration = Math.max(1, Number(duration || 1));
  if (startTime !== undefined) payload.timezone = timezone;

  if (!Object.keys(payload).length) return;

  const response = await fetch(
    `${ZOOM_API}/meetings/${encodeURIComponent(meetingId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok && response.status !== 204) {
    let data = {};
    try { data = await response.json(); } catch {}
    throw new Error(data.message || 'Failed to update Zoom meeting');
  }
}

async function deleteMeeting(meetingId) {
  if (!meetingId || !configured()) return;

  const token = await getAccessToken();
  const response = await fetch(
    `${ZOOM_API}/meetings/${encodeURIComponent(meetingId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  if (!response.ok && ![204,404].includes(response.status)) {
    let data = {};
    try { data = await response.json(); } catch {}
    throw new Error(data.message || 'Failed to cancel Zoom meeting');
  }
}

module.exports = {
  configured,
  createMeeting,
  updateMeeting,
  deleteMeeting
};
