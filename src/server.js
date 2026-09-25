require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const connectDB = require('./config/db');
const bootstrapSuperAdmin = require('./services/superadmin-bootstrap.service');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 64) {
  throw new Error('JWT_SECRET must be at least 64 characters');
}

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean),
  credentials: false
}));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 400 }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'academyflow',
    time: new Date().toISOString()
  });
});

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/superadmin', require('./routes/superadmin.routes'));
app.use('/api/live-sessions', require('./routes/live.routes'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

const port = Number(process.env.PORT || 3000);

async function start() {
  await connectDB();
  await bootstrapSuperAdmin();

  app.listen(port, () => {
    console.log(`AcademyFlow running on http://localhost:${port}`);
  });
}

start().catch(err => {
  console.error(err);
  process.exit(1);
});
