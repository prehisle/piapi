/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production'

const nextConfig = {
  output: isProd ? 'export' : undefined,
  // basePath ensures all assets and links are prefixed with /piadmin
  basePath: isProd ? '/piadmin' : undefined,
  assetPrefix: isProd ? '/piadmin' : undefined,
  // Note: NEXT_PUBLIC_BASE_PATH is NOT set here to avoid double basePath
  // The basePath config above already handles prefixing for Next.js routing
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    if (isProd) {
      return []
    }

    // Development mode: proxy API requests to backend
    const backend = process.env.PIAPI_DEV_PROXY ?? 'http://localhost:9200'
    const beforeFiles = [
      {
        source: '/piapi/:path*',
        destination: `${backend}/piapi/:path*`,
      },
      {
        source: '/piadmin/api/:path*',
        destination: `${backend}/piadmin/api/:path*`,
      },
      {
        source: '/api/:path*',
        destination: `${backend}/piadmin/api/:path*`,
      },
    ]
    return { beforeFiles }
  },
}

export default nextConfig
