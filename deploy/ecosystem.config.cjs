/**
 * PM2 ecosystem for the jewelry inventory production deployment.
 *
 * Start:  pm2 start deploy/ecosystem.config.cjs
 * Reload: pm2 reload ecosystem.config.cjs  (zero-downtime)
 * Logs:   pm2 logs jewelry-api / jewelry-web
 */
module.exports = {
  apps: [
    {
      name: 'jewelry-api',
      cwd: '/opt/jewelry',
      script: 'node',
      // Node 20+ supports --env-file natively
      args: '--env-file=/opt/jewelry/.env apps/api/dist/index.js',
      env: { NODE_ENV: 'production' },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '600M',
      out_file: '/var/log/jewelry-api.out.log',
      error_file: '/var/log/jewelry-api.err.log',
      time: true,
    },
    {
      name: 'jewelry-web',
      cwd: '/opt/jewelry/apps/web',
      script: 'node',
      // Use the real JS entry of next (the .bin/next is a sh shim pnpm creates
      // which PM2's node interpreter can't execute).
      args: 'node_modules/next/dist/bin/next start -p 3000',
      env: { NODE_ENV: 'production' },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '700M',
      out_file: '/var/log/jewelry-web.out.log',
      error_file: '/var/log/jewelry-web.err.log',
      time: true,
    },
  ],
}
