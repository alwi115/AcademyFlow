require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const connectDB = require('./config/db');
const bootstrapSuperAdmin = require('./services/superadmin-bootstrap.service');
const liveReminderWorker = require('./services/live-reminder.service');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 64) {
  throw new Error('JWT_SECRET must be at least 64 characters');
}

const app = express();

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
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

app.post('/api/webhooks/zoom', express.raw({ type: 'application/json', limit: '1mb' }), require('./controllers/zoom-webhook.controller').handle);

app.use(express.json({ limit: '1mb' }));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 400,
  standardHeaders: 'draft-8',
  legacyHeaders: false
}));

app.use(express.static(path.join(__dirname, '..', 'public'), {
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

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'academyflow',
    time: new Date().toISOString()
  });
});

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/superadmin', require('./routes/superadmin.routes'));
app.use('/api/academy', require('./routes/academy.routes'));
app.use('/api/student', require('./routes/student.routes'));
app.use('/api/instructor', require('./routes/instructor.routes'));
app.use('/api/live-sessions', require('./routes/live.routes'));

app.use((err, req, res, next) => {
  console.error(err);
  const status = Number(err.status || 500);

  res.status(status).json({
    message: status >= 500 ? 'Internal server error' : err.message
  });
});

const port = Number(process.env.PORT || 3000);

async function start() {
  await connectDB();
  await bootstrapSuperAdmin();
  liveReminderWorker.start();

  app.listen(port, () => {
    console.log(`AcademyFlow running on http://localhost:${port}`);
  });
}

start().catch(err => {
  console.error(err);
  process.exit(1);
});
