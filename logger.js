/**
 * Command Center — Client-Side Access Logger
 *
 * Reads ?user= from the URL (set by your SSO/intranet) and stores it
 * in sessionStorage so it persists across page navigations.
 *
 * Sends a log entry to POST /api/log on every page load.
 * On the embed page it also captures the dashboard title and department.
 *
 * Usage: include <script src="logger.js"></script> on every page.
 */

(function () {
  const LOG_ENDPOINT = '/api/log';

  // ── 1. Resolve username ─────────────────────────────────────────────────
  // Check URL param first (?user=jdoe), then fall back to sessionStorage.
  const urlParams = new URLSearchParams(window.location.search);
  const userFromUrl = urlParams.get('user');

  if (userFromUrl) {
    sessionStorage.setItem('cc_user', userFromUrl);
  }

  const user = sessionStorage.getItem('cc_user') || 'unknown';

  // ── 2. Determine page context ───────────────────────────────────────────
  const pathname  = window.location.pathname;
  const filename  = pathname.split('/').pop() || 'index.html';

  // Map filename → friendly page name
  const PAGE_NAMES = {
    'index.html':      'Home',
    '':                'Home',
    'hr.html':         'HR Dashboards',
    'finance.html':    'Finance Dashboards',
    'operations.html': 'Operations Dashboards',
    'sales.html':      'Sales Dashboards',
    'embed.html':      'Dashboard View',
  };

  let page      = PAGE_NAMES[filename] || filename;
  let dept      = urlParams.get('dept')  || '';
  let dashboard = urlParams.get('title') || '';

  // On department list pages, infer dept from filename
  if (!dept) {
    if (filename === 'hr.html')         dept = 'HR';
    else if (filename === 'finance.html')    dept = 'Finance';
    else if (filename === 'operations.html') dept = 'Operations';
    else if (filename === 'sales.html')      dept = 'Sales';
  }

  // ── 3. Send log entry ───────────────────────────────────────────────────
  function sendLog() {
    const entry = {
      user,
      page,
      dashboard,
      dept,
      url: window.location.href,
    };

    // Use sendBeacon if available (non-blocking, survives page unload)
    const payload = JSON.stringify(entry);
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon(LOG_ENDPOINT, blob);
    } else {
      fetch(LOG_ENDPOINT, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    payload,
        keepalive: true,
      }).catch(() => {}); // silently ignore errors
    }
  }

  // Send on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sendLog);
  } else {
    sendLog();
  }
})();
