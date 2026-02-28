/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['yaml', 'puppeteer', 'puppeteer-core', 'sharp'],
  async rewrites() {
    return [
      {
        // Serve legacy /logos/* URLs through the API route
        // (Next.js doesn't serve files added to /public after build)
        source: '/logos/:path*',
        destination: '/api/logos/:path*',
      },
      {
        // Serve legacy /avatars/* URLs through the API route
        source: '/avatars/:path*',
        destination: '/api/avatars/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
