/**
 * Command Center — Access Log Server
 * Node.js / Express
 *
 * Usage:
 *   npm install
 *   node server.js
 *
 * Serves the portal on http://localhost:3000
 * Writes access logs to logs/access.log (JSON Lines format)
 * View logs at http://localhost:3000/admin/logs
 */

const express  = require('express');
const fs       = require('fs');
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;
const LOG_FILE = path.join(__dirname, 'logs', 'access.log');

// Ensure logs directory exists
if (!fs.existsSync(path.join(__dirname, 'logs'))) {
  fs.mkdirSync(path.join(__dirname, 'logs'));
}

app.use(express.json());

// ── Serve static portal files ─────────────────────────────────────────────
app.use(express.static(__dirname));

// ── POST /api/log — receive a log entry from the client ──────────────────
app.post('/api/log', (req, res) => {
  const { user, page, dashboard, dept, url } = req.body;

  const entry = {
    timestamp:  new Date().toISOString(),
    user:       user       || 'unknown',
    dept:       dept       || '',
    page:       page       || '',
    dashboard:  dashboard  || '',
    url:        url        || '',
    ip:         req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
    userAgent:  req.headers['user-agent'] || '',
  };

  const line = JSON.stringify(entry) + '\n';
  fs.appendFile(LOG_FILE, line, err => {
    if (err) console.error('Log write error:', err);
  });

  res.sendStatus(200);
});

// ── GET /admin/logs — view access log as HTML table ───────────────────────
app.get('/admin/logs', (req, res) => {
  let entries = [];

  if (fs.existsSync(LOG_FILE)) {
    const lines = fs.readFileSync(LOG_FILE, 'utf8')
      .split('\n')
      .filter(l => l.trim());

    entries = lines
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean)
      .reverse(); // newest first
  }

  const rows = entries.map(e => `
    <tr>
      <td>${e.timestamp.replace('T', ' ').replace('Z', '').slice(0, 19)}</td>
      <td><strong>${escHtml(e.user)}</strong></td>
      <td>${escHtml(e.dept)}</td>
      <td>${escHtml(e.page)}</td>
      <td>${escHtml(e.dashboard)}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(e.ip)}">${escHtml(e.ip)}</td>
    </tr>`).join('');

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Access Log — Command Center</title>
  <style>
    body { font-family: 'Segoe UI', sans-serif; background: #f0f2f5; margin: 0; }
    header { background: #1e3a5f; color: #fff; padding: 1rem 2rem; display: flex; align-items: center; justify-content: space-between; }
    header h1 { margin: 0; font-size: 1.2rem; }
    header a  { color: rgba(255,255,255,0.75); font-size: 0.85rem; text-decoration: none; }
    header a:hover { color: #fff; }
    .container { max-width: 1300px; margin: 2rem auto; padding: 0 1.5rem; }
    .meta { color: #718096; font-size: 0.85rem; margin-bottom: 1rem; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
    th { background: #1e3a5f; color: #fff; text-align: left; padding: 0.75rem 1rem; font-size: 0.8rem; letter-spacing: 0.5px; text-transform: uppercase; }
    td { padding: 0.7rem 1rem; font-size: 0.88rem; border-bottom: 1px solid #e2e8f0; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #f7fafc; }
    .empty { text-align: center; padding: 3rem; color: #718096; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; }
    .export-btn { background: #1e3a5f; color: #fff; padding: 7px 16px; border-radius: 6px; text-decoration: none; font-size: 0.85rem; }
    .export-btn:hover { opacity: 0.85; }
  </style>
</head>
<body>
  <header>
    <h1>&#128202; Access Log — Command Center</h1>
    <div style="display:flex;gap:1rem;align-items:center;">
      <a href="/admin/logs/export">&#8595; Export CSV</a>
      <a href="/index.html">&#8592; Back to Portal</a>
    </div>
  </header>
  <div class="container">
    <p class="meta">${entries.length} total entries &nbsp;|&nbsp; Log file: logs/access.log &nbsp;|&nbsp; Newest first</p>
    <table>
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>User</th>
          <th>Department</th>
          <th>Page</th>
          <th>Dashboard</th>
          <th>IP Address</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="6" class="empty">No log entries yet.</td></tr>'}
      </tbody>
    </table>
  </div>
</body>
</html>`);
});

// ── GET /admin/logs/export — download as CSV ──────────────────────────────
app.get('/admin/logs/export', (req, res) => {
  let entries = [];

  if (fs.existsSync(LOG_FILE)) {
    const lines = fs.readFileSync(LOG_FILE, 'utf8')
      .split('\n')
      .filter(l => l.trim());

    entries = lines
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  }

  const header = 'Timestamp,User,Department,Page,Dashboard,IP,UserAgent\n';
  const rows   = entries.map(e =>
    [e.timestamp, e.user, e.dept, e.page, e.dashboard, e.ip, e.userAgent]
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
  ).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="command-center-log-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(header + rows);
});

// ── Helpers ───────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Command Center running at http://localhost:${PORT}`);
  console.log(`Access log viewer: http://localhost:${PORT}/admin/logs`);
});
