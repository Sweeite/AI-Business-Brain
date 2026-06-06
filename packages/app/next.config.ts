import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@brain/core'],
  experimental: {
    typedRoutes: true,
  },
}

export default nextConfig
