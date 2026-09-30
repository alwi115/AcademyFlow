if (process.env.ACADEMYFLOW_ISOLATED_DEMO !== 'true') require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const connectDB = require('./config/db');
const bootstrapSuperAdmin = require('./services/superadmin-bootstrap.service');
const liveReminderWorker = require('./services/live-reminder.service');
const backupWorker = require('./services/backup-worker.service');
const backupService = require('./services/backup.service');
const SystemError = require('./models/SystemError');
const systemMonitor = require('./services/system-monitor.service');
const auditMiddleware = require('./middleware/audit');
const mongoose = require('mongoose');
const { protectMutations } = require('./middleware/csrf');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 64) {
  throw new Error('JWT_SECRET must be at least 64 characters');
}

const app = express();

app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(18).toString('base64');
  next();
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`, 'https://www.youtube.com'],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`, "'unsafe-inline'", 'https://fonts.googleapis.com'],
      styleSrcAttr: ["'unsafe-inline'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      frameSrc: ["'self'", 'https://www.youtube-nocookie.com', 'https://www.youtube.com'],
      formAction: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'same-origin' }
}));

app.use(cors({
  origin: (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean),
  credentials: true
}));

function buildStrictPublicCsp(nonce) {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "script-src-attr 'none'",
    `style-src 'self' 'nonce-${nonce}' https://fonts.googleapis.com`,
    "style-src-attr 'unsafe-inline'",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'none'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "media-src 'self'",
    'upgrade-insecure-requests'
  ].join('; ');
}

const HARDENED_PUBLIC_PATHS = new Set([
  '/',
  '/index.html',
  '/academy/login.html',
  '/owner/login.html',
  '/superadmin/login.html',
  '/academy/legal-acceptance.html',
  '/legal/',
  '/legal/index.html',
  '/legal/privacy.html',
  '/legal/terms.html',
  '/legal/refund.html',
  '/legal/data-deletion.html',
  '/legal/cookies.html',
  '/legal/acceptable-use.html',
  '/legal/support.html',
  '/legal/dpa.html',
  '/legal/privacy-request.html',
  '/robots.txt',
  '/sitemap.xml'
]);

app.use((req, res, next) => {
  if (HARDENED_PUBLIC_PATHS.has(req.path)) {
    res.setHeader('Content-Security-Policy', buildStrictPublicCsp(res.locals.cspNonce));
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  }
  next();
});

app.use((req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()'
  );
  next();
});

app.use(async (req, res, next) => {
  const restoring = req.path !== '/api/health' && req.path.startsWith('/api/') && await backupService.restoreInProgress();
  if ((!backupService.isBusy() && !restoring) || !req.path.startsWith('/api/')) {
    return next();
  }

  const operation = restoring ? 'restore' : backupService.operation();
  const isSuperAdminBackupRoute = req.path.startsWith('/api/superadmin/backups');
  const mutating = ['POST','PUT','PATCH','DELETE'].includes(req.method);

  if (operation === 'restore') {
    const safeRestoreRead =
      req.method === 'GET' &&
      (
        req.path === '/api/superadmin/health' ||
        req.path === '/api/superadmin/backups'
      );

    if (!safeRestoreRead) {
      res.setHeader('Retry-After', '60');
      return res.status(503).json({
        message: 'System restore is in progress. Please retry shortly.'
      });
    }
  }

  if (
    operation === 'backup' &&
    mutating &&
    !isSuperAdminBackupRoute
  ) {
    res.setHeader('Retry-After', '30');
    return res.status(503).json({
      message: 'A consistent backup snapshot is being created. Please retry shortly.'
    });
  }

  next();
});

const zoomWebhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 180,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});


app.post(
  '/api/webhooks/zoom',
  zoomWebhookLimiter,
  express.raw({ type: 'application/json', limit: '1mb' }),
  require('./controllers/zoom-webhook.controller').handle
);

const stripeWebhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many Stripe webhook requests. Retry shortly.' }
});

app.post(
  '/api/webhooks/stripe',
  stripeWebhookLimiter,
  express.raw({ type: 'application/json', limit: '1mb' }),
  require('./controllers/payment-checkout.controller').webhook
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
app.use('/api', protectMutations);

app.use(auditMiddleware);

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 400,
  standardHeaders: 'draft-8',
  legacyHeaders: false
}));

const publicRoot = path.join(__dirname, '..', 'public');

function resolveHtmlFile(requestPath) {
  let relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  if (relativePath.endsWith('/')) relativePath += 'index.html';
  if (!relativePath.toLowerCase().endsWith('.html')) return null;

  const fullPath = path.resolve(publicRoot, relativePath);
  if (!fullPath.startsWith(publicRoot + path.sep)) return null;
  return fullPath;
}

function injectCspNonce(html, nonce) {
  return html
    .replace(/<style\b(?![^>]*\bnonce=)/gi, `<style nonce="${nonce}"`)
    .replace(/<script\b(?![^>]*\bnonce=)/gi, `<script nonce="${nonce}"`);
}

function injectAcademyAiAssets(html, requestPath, nonce) {
  const portal = requestPath.startsWith('/student/')
    ? 'student'
    : requestPath.startsWith('/instructor/')
      ? 'instructor'
      : '';

  if (!portal || html.includes('/js/academy-ai.js')) return html;

  const styleTag = '<link rel="stylesheet" href="/css/academy-ai.css">';
  const scriptTag = `<script nonce="${nonce}" src="/js/academy-ai.js" data-portal="${portal}" defer></script>`;

  return html
    .replace('</head>', `  ${styleTag}\n</head>`)
    .replace('</body>', `  ${scriptTag}\n</body>`);
}

app.use(async (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();

  const htmlFile = resolveHtmlFile(req.path);
  if (!htmlFile) return next();

  try {
    const source = await fs.promises.readFile(htmlFile, 'utf8');
    const securedSource = source.replace(/<head([^>]*)>/i, '<head$1><script src="/js/secure-fetch.js"></script><script src="/js/account-navigation.js" defer></script>');
    const withNonce = injectCspNonce(securedSource, res.locals.cspNonce);
    const html = injectAcademyAiAssets(withNonce, req.path, res.locals.cspNonce);

    res.type('html');
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    if (req.method === 'HEAD') return res.end();
    return res.send(html);
  } catch (err) {
    if (err && err.code === 'ENOENT') return next();
    return next(err);
  }
});

app.use(express.static(publicRoot, {
  etag: true,
  maxAge: '5m',
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate');
    }
  }
}));

app.get('/api/health', async (req, res) => {
  let ok = false;
  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db.command({ ping: 1 }, { timeoutMS: 3000 });
      ok = true;
    }
  } catch {}
  res.status(ok ? 200 : 503);
  res.set('Cache-Control', 'no-store');
  res.json({
    ok,
    service: 'academyflow',
    time: new Date().toISOString()
  });
});

app.use('/api/public', require('./routes/public.routes'));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/superadmin', require('./routes/superadmin.routes'));
app.use('/api/academy', require('./routes/academy.routes'));
app.use('/api/student', require('./routes/student.routes'));
app.use('/api/instructor', require('./routes/instructor.routes'));
app.use('/api/ai', require('./routes/ai.routes'));
app.use('/api/live-sessions', require('./routes/live.routes'));
app.use('/api/zoom', require('./routes/zoom.routes'));

app.use((req, res) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'"
  );
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ message: 'Not Found' });
  }

  return res.status(404).type('text/plain').send('Not Found');
});

app.use((err, req, res, next) => {
  console.error(err);
  const status = Number(err.status || (err.code === 11000 ? 409 : ['ValidationError', 'CastError'].includes(err.name) ? 400 : 500));

  if (status >= 500) {
    SystemError.create({
      status,
      method: String(req.method || '').slice(0, 16),
      path: String(req.path || '').slice(0, 1000),
      message: String(err.message || 'Internal server error').slice(0, 1500),
      code: String(err.code || '').slice(0, 120),
      actorId: req.user?.sub || null,
      actorRole: req.user?.role || '',
      academyId: req.user?.academyId || null
    }).catch(logErr => {
      console.error('[system-error-log]', logErr.message);
    });
  }

  res.status(status).json({
    message: status >= 500 ? 'Internal server error' : err.message
  });
});

const port = Number(process.env.PORT || 3000);

async function start() {
  await connectDB();
  await Promise.all(Object.values(mongoose.models).map(model => model.init()));
  await bootstrapSuperAdmin();
  liveReminderWorker.start();
  require('./services/notification-delivery.service').start();
  backupWorker.start();
  systemMonitor.start();

  app.listen(port, () => {
    console.log(`AcademyFlow running on http://localhost:${port}`);
  });
}

if (require.main === module) {
  start().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
module.exports = { app, start };
