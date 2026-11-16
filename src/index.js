require('dotenv').config();
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be configured before starting the server');
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const pool = require('./db/pool');

const authRoutes = require('./routes/auth');
const accountsRoutes = require('./routes/accounts');
const dataRoutes = require('./routes/data');

const app = express();
const PORT = process.env.PORT || 3000;

async function ensureInitialAdmin() {
  const { rows } = await pool.query('SELECT id FROM users LIMIT 1');
  if (rows.length) return;

  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error('No users exist; set ADMIN_PASSWORD to create the initial manager account');
  }

  const username = (process.env.ADMIN_USERNAME || 'inspera').trim().toLowerCase();
  if (!username) {
    throw new Error('ADMIN_USERNAME cannot be empty');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (username, password_hash, role, display_name)
     VALUES ($1, $2, 'manager', $3)
     ON CONFLICT (username) DO NOTHING`,
    [username, passwordHash, process.env.ADMIN_DISPLAY_NAME || 'מנהל ראשי']
  );
}

// ── Security ────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET','POST','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'יותר מדי בקשות, נסה שוב בעוד מספר דקות' },
});
app.use(limiter);

// Stricter limit for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'יותר מדי ניסיונות התחברות' },
});

// ── Body parser ─────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));

// ── Routes ──────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/accounts', accountsRoutes);

// Data sub-routes mounted under /api/accounts/:accountId
app.use('/api/accounts/:accountId', dataRoutes);

// ── Health check ────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ── Serve frontend (index.html) ─────────────────────────────────
// Place index.html in the project root or a `public/` folder
const frontendPath = path.join(__dirname, '..', 'public', 'index.html');
if (fs.existsSync(frontendPath)) {
  app.get('/', (req, res) => res.sendFile(frontendPath));
  app.use(express.static(path.join(__dirname, '..', 'public')));
}

// ── 404 ─────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  // For non-API routes, serve frontend if it exists
  if (fs.existsSync(frontendPath)) return res.sendFile(frontendPath);
  res.status(404).json({ error: 'Not found' });
});

// ── Error handler ───────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'שגיאת שרת' });
});

// ── Start ───────────────────────────────────────────────────────
async function startServer() {
  await ensureInitialAdmin();
  app.listen(PORT, () => {
    console.log(`Inspera server running on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Server startup failed:', error);
  process.exitCode = 1;
});
