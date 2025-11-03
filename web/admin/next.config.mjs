/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production'

const nextConfig = {
  output: isProd ? 'export' : undefined,
  // Note: basePath is not set because the backend serves the UI at /piadmin/
  // and strips the prefix before serving static files
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
        source: '/api/:path*',
        destination: `${backend}/piadmin/api/:path*`,
      },
    ]
    return { beforeFiles }
  },
}

export default nextConfig
