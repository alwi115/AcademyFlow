const crypto = require('crypto');
const Academy = require('../models/Academy');

const ZOOM_API = 'https://api.zoom.us/v2';
const ZOOM_AUTHORIZE_URL = 'https://zoom.us/oauth/authorize';
const ZOOM_TOKEN_URL = 'https://zoom.us/oauth/token';
const ZOOM_REVOKE_URL = 'https://zoom.us/oauth/revoke';

function configured() {
  return Boolean(
    process.env.ZOOM_CLIENT_ID &&
    process.env.ZOOM_CLIENT_SECRET &&
    process.env.ZOOM_REDIRECT_URI
  );
}

function isConnected(academy) {
  return Boolean(academy?.zoomIntegration?.connected);
}

function basicAuthorization() {
  return 'Basic ' + Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString('base64');
}

function encryptionKey() {
  const source = String(
    process.env.ZOOM_TOKEN_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    ''
  );

  if (!source) {
    throw new Error('Zoom token encryption secret is not configured');
  }

  return crypto.createHash('sha256').update(source).digest();
}

function encryptTokens(tokens) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv, { authTagLength: 16 });
  const plaintext = Buffer.from(JSON.stringify(tokens), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, ciphertext]).toString('base64url');
}

function decryptTokens(value) {
  if (!value) {
    throw new Error('Zoom account is not connected');
  }

  const packed = Buffer.from(String(value), 'base64url');
  if (packed.length < 29) {
    throw new Error('Stored Zoom credentials are invalid');
  }

  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]).toString('utf8');

  return JSON.parse(plaintext);
}

function makeAuthorizationUrl(state) {
  if (!configured()) {
    throw new Error('Zoom OAuth is not configured on the server');
  }

  const url = new URL(ZOOM_AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', process.env.ZOOM_CLIENT_ID);
  url.searchParams.set('redirect_uri', process.env.ZOOM_REDIRECT_URI);
  url.searchParams.set('state', state);
  return url.toString();
}

async function tokenRequest(fields) {
  if (!configured()) {
    throw new Error('Zoom OAuth is not configured on the server');
  }

  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields || {})) {
    if (value !== undefined && value !== null && value !== '') {
      body.set(key, String(value));
    }
  }

  const response = await fetch(ZOOM_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthorization(),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  let data = {};
  try {
    data = await response.json();
  } catch {}

  if (!response.ok) {
    throw new Error(
      data.reason ||
      data.message ||
      data.error_description ||
      data.error ||
      'Zoom OAuth token request failed'
    );
  }

  return data;
}

async function exchangeAuthorizationCode(code) {
  return tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.ZOOM_REDIRECT_URI
  });
}

async function refreshAccessToken(refreshToken) {
  return tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });
}

async function revokeAccessToken(accessToken) {
  if (!configured() || !accessToken) return;

  const body = new URLSearchParams({ token: String(accessToken) });
  const response = await fetch(ZOOM_REVOKE_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthorization(),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  if (!response.ok && response.status !== 404) {
    let data = {};
    try { data = await response.json(); } catch {}
    throw new Error(
      data.reason ||
      data.message ||
      data.error_description ||
      'Failed to revoke Zoom access'
    );
  }
}

async function resolveAcademy(academyOrId) {
  if (!academyOrId) return null;

  if (academyOrId.zoomIntegration?.tokensEncrypted) {
    return academyOrId;
  }

  const id = academyOrId._id || academyOrId;
  return Academy.findById(id).select('+zoomIntegration.tokensEncrypted');
}

async function saveTokens(academy, tokenData) {
  let current = {};

  // A fresh authorization normally returns both tokens. Only decrypt the
  // previous payload when Zoom omits one of them during a refresh.
  if (
    (!tokenData.access_token || !tokenData.refresh_token) &&
    academy.zoomIntegration?.tokensEncrypted
  ) {
    current = decryptTokens(academy.zoomIntegration.tokensEncrypted);
  }

  const accessToken = tokenData.access_token || current.accessToken;
  const refreshToken = tokenData.refresh_token || current.refreshToken;

  if (!accessToken || !refreshToken) {
    throw new Error('Zoom did not return the required OAuth tokens');
  }

  academy.zoomIntegration = academy.zoomIntegration || {};
  academy.zoomIntegration.tokensEncrypted = encryptTokens({
    accessToken,
    refreshToken
  });
  academy.zoomIntegration.accessTokenExpiresAt = new Date(
    Date.now() + Math.max(60, Number(tokenData.expires_in || 3600)) * 1000
  );

  await academy.save();
  return accessToken;
}

async function getValidAccessToken(academyOrId, forceRefresh = false) {
  if (!configured()) {
    throw new Error('Zoom OAuth is not configured on the server');
  }

  const academy = await resolveAcademy(academyOrId);
  if (!academy || !academy.zoomIntegration?.connected) {
    throw new Error('اربط حساب Zoom بالأكاديمية أولاً');
  }

  const tokens = decryptTokens(academy.zoomIntegration.tokensEncrypted);
  const expiresAt = academy.zoomIntegration.accessTokenExpiresAt
    ? new Date(academy.zoomIntegration.accessTokenExpiresAt).getTime()
    : 0;

  if (
    !forceRefresh &&
    tokens.accessToken &&
    expiresAt > Date.now() + 90 * 1000
  ) {
    return { academy, accessToken: tokens.accessToken };
  }

  if (!tokens.refreshToken) {
    throw new Error('انتهت صلاحية ربط Zoom. أعد ربط الحساب.');
  }

  const refreshed = await refreshAccessToken(tokens.refreshToken);
  const accessToken = await saveTokens(academy, refreshed);
  return { academy, accessToken };
}

async function requestWithAcademy(academyOrId, path, options = {}) {
  const makeRequest = async token => {
    const headers = {
      Authorization: `Bearer ${token}`,
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    };

    return fetch(ZOOM_API + path, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined
        ? undefined
        : typeof options.body === 'string'
          ? options.body
          : JSON.stringify(options.body)
    });
  };

  let auth = await getValidAccessToken(academyOrId);
  let response = await makeRequest(auth.accessToken);

  if (response.status === 401) {
    auth = await getValidAccessToken(auth.academy, true);
    response = await makeRequest(auth.accessToken);
  }

  return { response, academy: auth.academy };
}

async function parseZoomResponse(response, fallbackMessage) {
  if (response.status === 204) return null;

  let data = {};
  try {
    data = await response.json();
  } catch {}

  if (!response.ok) {
    throw new Error(
      data.message ||
      data.reason ||
      data.error_description ||
      fallbackMessage
    );
  }

  return data;
}

async function getCurrentUser(accessToken) {
  const response = await fetch(`${ZOOM_API}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  return parseZoomResponse(response, 'Failed to read Zoom user');
}

async function saveAuthorizedAccount(academy, tokenData, zoomUser, connectedBy) {
  academy.zoomIntegration = academy.zoomIntegration || {};
  academy.zoomIntegration.connected = true;
  academy.zoomIntegration.zoomUserId = String(zoomUser?.id || '');
  academy.zoomIntegration.zoomEmail = String(zoomUser?.email || '').trim().toLowerCase();
  academy.zoomIntegration.zoomDisplayName = String(
    zoomUser?.display_name ||
    [zoomUser?.first_name, zoomUser?.last_name].filter(Boolean).join(' ') ||
    zoomUser?.email ||
    ''
  ).trim();
  academy.zoomIntegration.connectedAt = new Date();
  academy.zoomIntegration.connectedBy = connectedBy || null;
  academy.zoomIntegration.oauthStateHash = '';
  academy.zoomIntegration.oauthStateExpiresAt = null;

  await saveTokens(academy, tokenData);
}

async function revokeForAcademy(academyOrId) {
  const academy = await resolveAcademy(academyOrId);
  if (!academy?.zoomIntegration?.tokensEncrypted) return;

  const tokens = decryptTokens(academy.zoomIntegration.tokensEncrypted);
  if (tokens.accessToken) {
    await revokeAccessToken(tokens.accessToken);
  }
}

async function createMeeting(academyOrId, {
  topic,
  startTime,
  duration = 60,
  timezone = 'Asia/Muscat'
}) {
  const { response } = await requestWithAcademy(
    academyOrId,
    '/users/me/meetings',
    {
      method: 'POST',
      body: {
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
      }
    }
  );

  const data = await parseZoomResponse(response, 'Failed to create Zoom meeting');

  return {
    meetingId: String(data.id),
    joinUrl: data.join_url,
    startUrl: data.start_url,
    password: data.password || ''
  };
}

async function updateMeeting(academyOrId, meetingId, {
  topic,
  startTime,
  duration,
  timezone = 'Asia/Muscat'
} = {}) {
  if (!meetingId || !configured() || !isConnected(academyOrId)) return;

  const payload = {};
  if (topic !== undefined) payload.topic = topic;
  if (startTime !== undefined) {
    payload.start_time = new Date(startTime).toISOString();
    payload.timezone = timezone;
  }
  if (duration !== undefined) payload.duration = Math.max(1, Number(duration || 1));
  if (!Object.keys(payload).length) return;

  const { response } = await requestWithAcademy(
    academyOrId,
    `/meetings/${encodeURIComponent(meetingId)}`,
    { method: 'PATCH', body: payload }
  );

  await parseZoomResponse(response, 'Failed to update Zoom meeting');
}

async function deleteMeeting(academyOrId, meetingId) {
  if (!meetingId || !configured() || !isConnected(academyOrId)) return;

  const { response } = await requestWithAcademy(
    academyOrId,
    `/meetings/${encodeURIComponent(meetingId)}`,
    { method: 'DELETE' }
  );

  if (response.status === 404 || response.status === 204) return;
  await parseZoomResponse(response, 'Failed to cancel Zoom meeting');
}

module.exports = {
  configured,
  isConnected,
  makeAuthorizationUrl,
  exchangeAuthorizationCode,
  getCurrentUser,
  saveAuthorizedAccount,
  revokeForAcademy,
  createMeeting,
  updateMeeting,
  deleteMeeting
};
