/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['yaml', 'puppeteer', 'puppeteer-core', 'sharp'],
  },
};

module.exports = nextConfig;
