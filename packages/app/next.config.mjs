/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@brain/core'],
  experimental: {
    typedRoutes: true,
  },
  webpack(config) {
    // core uses .js extensions on imports (required for NodeNext/worker tsc).
    // Webpack needs to be told to also try .ts/.tsx when resolving .js.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    }
    return config
  },
}

export default nextConfig
