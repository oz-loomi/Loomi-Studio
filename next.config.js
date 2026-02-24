/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['yaml', 'puppeteer', 'puppeteer-core', 'sharp'],
  },
  async rewrites() {
    return [
      {
        // Serve legacy /logos/* URLs through the API route
        // (Next.js doesn't serve files added to /public after build)
        source: '/logos/:path*',
        destination: '/api/logos/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
