/**
 * PM2 Process Manager Configuration
 *
 * Usage:
 *   npm install -g pm2        (install PM2 globally, once)
 *   npm run prod              (start with PM2)
 *   npm run logs              (tail logs)
 *   npm run stop              (stop)
 *   pm2 save                  (persist across reboots)
 *   pm2 startup               (auto-start on server reboot)
 */

module.exports = {
  apps: [
    {
      name:               'command-center',
      script:             'server.js',
      instances:          1,
      autorestart:        true,
      watch:              false,
      max_memory_restart: '256M',

      env_production: {
        NODE_ENV: 'production',
        PORT:     3000,
      },

      // Log files (separate from access.log)
      error_file:       'logs/pm2-error.log',
      out_file:         'logs/pm2-out.log',
      log_date_format:  'YYYY-MM-DD HH:mm:ss Z',
      merge_logs:       true,

      // Restart policy
      min_uptime:       '5s',
      max_restarts:     10,
      restart_delay:    4000,

      // Graceful shutdown
      kill_timeout:     10000,
      listen_timeout:   8000,
      shutdown_with_message: false,
    },
  ],
};
