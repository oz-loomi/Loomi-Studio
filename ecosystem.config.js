module.exports = {
  apps: [
    {
      name: 'loomi-studio',
      script: 'npm',
      args: 'start',
      cwd: '/var/www/loomi-studio',
      max_memory_restart: '512M',
      kill_timeout: 5000,
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=768',
        PORT: 3000,
      },
    },
  ],
};
