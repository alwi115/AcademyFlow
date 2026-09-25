const ZOOM_API = 'https://api.zoom.us/v2';

function configured() {
  return Boolean(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);
}

async function getAccessToken() {
  if (!configured()) throw new Error('Zoom integration is not configured');
  const basic = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64');
  const url = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(process.env.ZOOM_ACCOUNT_ID)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}` }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.reason || data.message || 'Failed to get Zoom access token');
  return data.access_token;
}

async function createMeeting({ topic, startTime, duration = 60, timezone = 'Asia/Muscat' }) {
  const token = await getAccessToken();
  const userId = process.env.ZOOM_USER_ID || 'me';
  const response = await fetch(`${ZOOM_API}/users/${encodeURIComponent(userId)}/meetings`, {
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
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to create Zoom meeting');
  return {
    meetingId: String(data.id),
    joinUrl: data.join_url,
    startUrl: data.start_url,
    password: data.password || ''
  };
}

module.exports = { configured, createMeeting };
