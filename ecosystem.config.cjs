/**
 * PM2 Ecosystem Configuration
 * For production deployment with PM2
 */

module.exports = {
  apps: [
    {
      name: 'perfect-catch-st-automation',
      script: 'src/server.js',
      instances: 'max', // Use all available CPU cores
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      merge_logs: true,
      // Graceful shutdown
      kill_timeout: 10000,
      listen_timeout: 10000,
      // Health check
      min_uptime: 5000,
      max_restarts: 10,
    },
  ],
};
