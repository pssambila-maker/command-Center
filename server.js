/**
 * Command Center — Production Server
 * Node.js / Express
 *
 * Setup:
 *   cp .env.example .env   (fill in values)
 *   npm install
 *   node server.js         (dev)
 *   npm run prod           (production via PM2)
 */

require('dotenv').config();

const express      = require('express');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const compression  = require('compression');
const fs           = require('fs');
const path         = require('path');
const crypto       = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV     = process.env.NODE_ENV || 'development';
const LOG_FILE     = path.join(__dirname, 'logs', 'access.log');
const MAX_LOG_BYTES = (parseInt(process.env.MAX_LOG_MB) || 50) * 1024 * 1024;
const ADMIN_USER   = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS   = process.env.ADMIN_PASS || 'changeme';

// ── Ensure logs directory exists ──────────────────────────────────────────
if (!fs.existsSync(path.join(__dirname, 'logs'))) {
  fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true });
}

// ── Security headers (helmet) ─────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'"],   // inline scripts in HTML pages
      styleSrc:    ["'self'", "'unsafe-inline'"],
      imgSrc:      ["'self'", 'data:'],
      frameSrc:    ['https://tableau.upstate.edu'],  // Tableau embeds only
      connectSrc:  ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false, // required for Tableau iframes
}));

// ── Gzip compression ──────────────────────────────────────────────────────
app.use(compression());

// ── Block sensitive files before static middleware ────────────────────────
const BLOCKED_PATHS = new Set([
  '/server.js', '/package.json', '/package-lock.json',
  '/.env', '/.gitignore', '/ecosystem.config.js', '/logger.js',
]);

app.use((req, res, next) => {
  const p = req.path.toLowerCase();
  if (BLOCKED_PATHS.has(p) || p.startsWith('/logs/') || p.startsWith('/node_modules/')) {
    return res.status(404).end();
  }
  next();
});

// ── Parse JSON bodies (with size limit) ──────────────────────────────────
app.use(express.json({ limit: '10kb' }));

// ── Rate limiters ─────────────────────────────────────────────────────────
const logLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 120,              // 2 requests/sec per IP — generous for legit use
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests',
});

// ── Serve static portal files ─────────────────────────────────────────────
app.use(express.static(__dirname, {
  index: 'index.html',
  dotfiles: 'deny',
  extensions: ['html', 'css', 'png', 'jpg', 'svg', 'ico'],
}));

// ── Health check ──────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  const logExists = fs.existsSync(LOG_FILE);
  let logSizeBytes = 0;
  try { logSizeBytes = logExists ? fs.statSync(LOG_FILE).size : 0; } catch {}

  res.json({
    status:    'ok',
    env:       NODE_ENV,
    uptime:    Math.floor(process.uptime()) + 's',
    logSizeMB: (logSizeBytes / 1024 / 1024).toFixed(2),
    timestamp: new Date().toISOString(),
  });
});

// ── Basic auth middleware for admin routes ────────────────────────────────
function requireBasicAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const base64 = authHeader.replace(/^Basic\s+/i, '');
  let valid = false;

  try {
    const [u, p] = Buffer.from(base64, 'base64').toString('utf8').split(':');
    // Constant-time compare to prevent timing attacks
    const uMatch = crypto.timingSafeEqual(Buffer.from(u || ''), Buffer.from(ADMIN_USER));
    const pMatch = crypto.timingSafeEqual(Buffer.from(p || ''), Buffer.from(ADMIN_PASS));
    valid = uMatch && pMatch;
  } catch {}

  if (!valid) {
    res.set('WWW-Authenticate', 'Basic realm="Command Center Admin"');
    return res.status(401).send('Unauthorized');
  }
  next();
}

// ── POST /api/log — receive access log entry ──────────────────────────────
app.post('/api/log', logLimiter, (req, res) => {
  const body = req.body || {};

  // Validate and sanitize fields
  const entry = {
    timestamp: new Date().toISOString(),
    user:      sanitize(body.user,      50)  || 'unknown',
    dept:      sanitize(body.dept,      30)  || '',
    page:      sanitize(body.page,      80)  || '',
    dashboard: sanitize(body.dashboard, 120) || '',
    url:       sanitize(body.url,       300) || '',
    ip:        req.headers['x-forwarded-for']?.split(',')[0]?.trim()
               || req.socket.remoteAddress || '',
    ua:        (req.headers['user-agent'] || '').slice(0, 200),
  };

  const line = JSON.stringify(entry) + '\n';

  // Rotate log if it exceeds size limit
  rotateIfNeeded();

  fs.appendFile(LOG_FILE, line, (err) => {
    if (err) console.error('[log write]', err.message);
  });

  res.sendStatus(200);
});

// ── GET /admin/logs — HTML table viewer ───────────────────────────────────
app.get('/admin/logs', adminLimiter, requireBasicAuth, (req, res) => {
  const entries = readLogEntries().reverse(); // newest first

  const rows = entries.map((e, i) => `
    <tr class="${i % 2 === 0 ? 'even' : ''}">
      <td>${esc(e.timestamp?.slice(0,19).replace('T',' '))}</td>
      <td><strong>${esc(e.user)}</strong></td>
      <td>${esc(e.dept)}</td>
      <td>${esc(e.page)}</td>
      <td>${esc(e.dashboard)}</td>
      <td>${esc(e.ip)}</td>
    </tr>`).join('');

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Access Log — Command Center</title>
  <style>
    body{font-family:'Segoe UI',sans-serif;background:#f0f2f5;margin:0}
    header{background:#1e3a5f;color:#fff;padding:1rem 2rem;display:flex;align-items:center;justify-content:space-between}
    header h1{margin:0;font-size:1.2rem}
    header a{color:rgba(255,255,255,.75);font-size:.85rem;text-decoration:none;margin-left:1.5rem}
    header a:hover{color:#fff}
    .wrap{max-width:1300px;margin:2rem auto;padding:0 1.5rem}
    .meta{color:#718096;font-size:.85rem;margin-bottom:1rem}
    table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.08)}
    th{background:#1e3a5f;color:#fff;text-align:left;padding:.75rem 1rem;font-size:.78rem;letter-spacing:.5px;text-transform:uppercase}
    td{padding:.65rem 1rem;font-size:.87rem;border-bottom:1px solid #e2e8f0}
    tr.even td{background:#f7fafc}
    tr:hover td{background:#ebf4ff}
    tr:last-child td{border-bottom:none}
    .empty{text-align:center;padding:3rem;color:#718096}
  </style>
</head>
<body>
  <header>
    <h1>&#128202; Access Log — Command Center</h1>
    <div>
      <a href="/admin/logs/export">&#8595; Export CSV</a>
      <a href="/index.html">&#8592; Portal</a>
    </div>
  </header>
  <div class="wrap">
    <p class="meta">${entries.length} entries &nbsp;|&nbsp; Log: logs/access.log &nbsp;|&nbsp; Newest first</p>
    <table>
      <thead>
        <tr><th>Timestamp</th><th>User</th><th>Dept</th><th>Page</th><th>Dashboard</th><th>IP</th></tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="6" class="empty">No entries yet.</td></tr>'}
      </tbody>
    </table>
  </div>
</body>
</html>`);
});

// ── GET /admin/logs/export — CSV download ─────────────────────────────────
app.get('/admin/logs/export', adminLimiter, requireBasicAuth, (req, res) => {
  const entries = readLogEntries();
  const header  = 'Timestamp,User,Department,Page,Dashboard,IP,UserAgent\n';
  const body    = entries.map(e =>
    [e.timestamp, e.user, e.dept, e.page, e.dashboard, e.ip, e.ua]
      .map(v => `"${String(v||'').replace(/"/g,'""')}"`)
      .join(',')
  ).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition',
    `attachment; filename="cc-log-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(header + body);
});

// ── 404 handler ───────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).send('Not found'));

// ── Global error handler ──────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[server error]', err.message);
  res.status(500).send('Internal server error');
});

// ── Helpers ───────────────────────────────────────────────────────────────
function sanitize(value, maxLen) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\r\n\t]/g, ' ').slice(0, maxLen).trim();
}

function esc(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function readLogEntries() {
  if (!fs.existsSync(LOG_FILE)) return [];
  return fs.readFileSync(LOG_FILE, 'utf8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function rotateIfNeeded() {
  try {
    if (!fs.existsSync(LOG_FILE)) return;
    const size = fs.statSync(LOG_FILE).size;
    if (size >= MAX_LOG_BYTES) {
      const rotated = LOG_FILE + '.' + new Date().toISOString().slice(0,10);
      fs.renameSync(LOG_FILE, rotated);
      console.log(`[log rotate] Rotated to ${path.basename(rotated)}`);
    }
  } catch (e) {
    console.error('[log rotate]', e.message);
  }
}

// ── Graceful shutdown ─────────────────────────────────────────────────────
function shutdown(signal) {
  console.log(`[shutdown] Received ${signal}. Closing server...`);
  server.close(() => {
    console.log('[shutdown] Server closed.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000); // force exit after 10s
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ── Start ─────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`[start] Command Center running on port ${PORT} (${NODE_ENV})`);
  console.log(`[start] Admin logs: http://localhost:${PORT}/admin/logs`);
  console.log(`[start] Health:     http://localhost:${PORT}/health`);
});
