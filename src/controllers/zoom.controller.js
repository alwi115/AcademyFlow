const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Academy = require('../models/Academy');
const User = require('../models/User');
const zoom = require('../services/zoom.service');
const auditService = require('../services/audit.service');

const STATE_COOKIE = 'af_zoom_oauth_state';
const STATE_TTL_MS = 10 * 60 * 1000;

function secureCookie() {
  return process.env.NODE_ENV === 'production' ||
    Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_ID);
}

function cookieValue(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return part.slice(index + 1).trim();
    }
  }
  return '';
}

function stateHash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function stateCookieOptions() {
  return {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: 'lax',
    path: '/',
    maxAge: STATE_TTL_MS
  };
}

function clearStateCookie(res) {
  res.clearCookie(STATE_COOKIE, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: 'lax',
    path: '/'
  });
}

function redirectSettings(res, status, reason = '') {
  const params = new URLSearchParams({ zoom: status });
  if (reason) params.set('reason', reason);
  return res.redirect('/academy/settings.html?' + params.toString());
}

async function status(req, res) {
  const academy = await Academy.findById(req.academyId)
    .select('zoomIntegration.connected zoomIntegration.zoomEmail zoomIntegration.zoomDisplayName zoomIntegration.connectedAt');

  if (!academy) {
    return res.status(404).json({ message: 'الأكاديمية غير موجودة' });
  }

  res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });
  res.json({
    appConfigured: zoom.configured(),
    connected: Boolean(academy.zoomIntegration?.connected),
    email: academy.zoomIntegration?.zoomEmail || '',
    displayName: academy.zoomIntegration?.zoomDisplayName || '',
    connectedAt: academy.zoomIntegration?.connectedAt || null
  });
}

async function connect(req, res) {
  if (!zoom.configured()) {
    return res.status(503).json({
      message: 'إعدادات Zoom ناقصة في Railway. أضف Client ID وClient Secret وRedirect URI.'
    });
  }

  const academy = await Academy.findById(req.academyId)
    .select('+zoomIntegration.oauthStateHash +zoomIntegration.oauthStateExpiresAt');

  const beforeConnection = academy ? {
    connected: Boolean(academy.zoomIntegration?.connected),
    zoomEmail: academy.zoomIntegration?.zoomEmail || ''
  } : null;

  if (!academy) {
    return res.status(404).json({ message: 'الأكاديمية غير موجودة' });
  }

  const nonce = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + STATE_TTL_MS);

  academy.zoomIntegration = academy.zoomIntegration || {};
  academy.zoomIntegration.oauthStateHash = stateHash(nonce);
  academy.zoomIntegration.oauthStateExpiresAt = expiresAt;
  await academy.save();

  await auditService.record(req, {
    action: 'zoom.connect.start',
    targetType: 'academy',
    targetId: academy._id,
    targetLabel: academy.name || String(academy._id),
    before: beforeConnection,
    after: { oauthPending: true },
    statusCode: 200
  });

  const state = jwt.sign(
    {
      purpose: 'zoom_oauth',
      academyId: String(req.academyId),
      sub: String(req.user.sub),
      nonce
    },
    process.env.JWT_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: Math.floor(STATE_TTL_MS / 1000)
    }
  );

  res.cookie(STATE_COOKIE, nonce, stateCookieOptions());
  res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });

  res.json({
    authorizationUrl: zoom.makeAuthorizationUrl(state)
  });
}

async function callback(req, res) {
  const state = String(req.query.state || '');
  if (!state) {
    clearStateCookie(res);
    return redirectSettings(res, 'error', 'missing_state');
  }

  let payload;
  try {
    payload = jwt.verify(state, process.env.JWT_SECRET, {
      algorithms: ['HS256']
    });
  } catch {
    clearStateCookie(res);
    return redirectSettings(res, 'error', 'invalid_state');
  }

  if (
    payload?.purpose !== 'zoom_oauth' ||
    !payload?.academyId ||
    !payload?.sub ||
    !payload?.nonce
  ) {
    clearStateCookie(res);
    return redirectSettings(res, 'error', 'invalid_state');
  }

  const cookieNonce = cookieValue(req, STATE_COOKIE);
  if (!cookieNonce || cookieNonce !== payload.nonce) {
    clearStateCookie(res);
    return redirectSettings(res, 'error', 'state_cookie_mismatch');
  }

  const academy = await Academy.findById(payload.academyId)
    .select('+zoomIntegration.tokensEncrypted +zoomIntegration.oauthStateHash +zoomIntegration.oauthStateExpiresAt');

  if (!academy) {
    clearStateCookie(res);
    return redirectSettings(res, 'error', 'academy_not_found');
  }

  const expectedHash = academy.zoomIntegration?.oauthStateHash || '';
  const stateExpiresAt = academy.zoomIntegration?.oauthStateExpiresAt
    ? new Date(academy.zoomIntegration.oauthStateExpiresAt).getTime()
    : 0;

  const nonceHash = stateHash(payload.nonce);
  const validHash = expectedHash &&
    expectedHash.length === nonceHash.length &&
    crypto.timingSafeEqual(Buffer.from(expectedHash), Buffer.from(nonceHash));

  if (!validHash || stateExpiresAt < Date.now()) {
    clearStateCookie(res);
    return redirectSettings(res, 'error', 'expired_state');
  }

  const owner = await User.findOne({
    _id: payload.sub,
    academyId: payload.academyId,
    role: 'owner',
    active: true
  }).select('_id');

  if (!owner) {
    clearStateCookie(res);
    return redirectSettings(res, 'error', 'owner_not_found');
  }

  academy.zoomIntegration.oauthStateHash = '';
  academy.zoomIntegration.oauthStateExpiresAt = null;
  await academy.save();
  clearStateCookie(res);

  if (req.query.error) {
    return redirectSettings(res, 'declined');
  }

  const code = String(req.query.code || '');
  if (!code) {
    return redirectSettings(res, 'error', 'missing_code');
  }

  try {
    const tokenData = await zoom.exchangeAuthorizationCode(code);
    const zoomUser = await zoom.getCurrentUser(tokenData.access_token);

    await zoom.saveAuthorizedAccount(
      academy,
      tokenData,
      zoomUser,
      owner._id
    );

    req.user = {
      sub: String(owner._id),
      role: 'owner',
      academyId: String(payload.academyId)
    };
    req.academyId = String(payload.academyId);

    await auditService.record(req, {
      action: 'zoom.connect.complete',
      targetType: 'academy',
      targetId: academy._id,
      targetLabel: academy.name || String(academy._id),
      after: {
        connected: true,
        zoomUserId: zoomUser?.id || '',
        zoomEmail: zoomUser?.email || ''
      },
      statusCode: 302
    });

    return redirectSettings(res, 'connected');
  } catch (err) {
    console.error('[zoom oauth callback]', err.message);
    return redirectSettings(res, 'error', 'oauth_failed');
  }
}

async function disconnect(req, res) {
  const academy = await Academy.findById(req.academyId)
    .select('+zoomIntegration.tokensEncrypted');

  const beforeDisconnect = academy ? {
    connected: Boolean(academy.zoomIntegration?.connected),
    zoomUserId: academy.zoomIntegration?.zoomUserId || '',
    zoomEmail: academy.zoomIntegration?.zoomEmail || ''
  } : null;

  if (!academy) {
    return res.status(404).json({ message: 'الأكاديمية غير موجودة' });
  }

  try {
    await zoom.revokeForAcademy(academy);
  } catch (err) {
    console.warn('[zoom revoke]', err.message);
  }

  academy.zoomIntegration = {
    connected: false,
    zoomUserId: '',
    zoomEmail: '',
    zoomDisplayName: '',
    tokensEncrypted: '',
    accessTokenExpiresAt: null,
    connectedAt: null,
    connectedBy: null,
    oauthStateHash: '',
    oauthStateExpiresAt: null
  };

  await academy.save();

  await auditService.record(req, {
    action: 'zoom.disconnect',
    targetType: 'academy',
    targetId: academy._id,
    targetLabel: academy.name || String(academy._id),
    before: beforeDisconnect,
    after: { connected: false },
    statusCode: 200
  });

  res.json({ ok: true });
}

module.exports = {
  status,
  connect,
  callback,
  disconnect
};
