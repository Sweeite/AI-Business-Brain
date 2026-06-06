/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@brain/core'],
  experimental: {
    typedRoutes: true,
  },
}

export default nextConfig
