import { resolveApiOrigin } from './src/lib/api-origin.mjs';

// The API address is validated in rewrites(), which `next build` calls: a production build without a
// usable API_URL fails there instead of deploying a broken site. (`next lint` also runs with
// NODE_ENV=production but never calls rewrites(), so it is unaffected.) The /api/health route
// validates the same value with the same function, see src/lib/api-origin.mjs.
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const apiOrigin = resolveApiOrigin();
    return [
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;