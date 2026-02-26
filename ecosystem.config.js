module.exports = {
  apps: [
    {
      name: 'loomi-studio',
      script: 'npm',
      args: 'start',
      cwd: '/var/www/loomi-studio',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
