/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production'

const adminBasePath = '/piadmin'

const nextConfig = {
  output: isProd ? 'export' : undefined,
  basePath: isProd ? adminBasePath : undefined,
  assetPrefix: isProd ? adminBasePath : undefined,
  env: {
    NEXT_PUBLIC_BASE_PATH: adminBasePath,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    if (isProd) {
      return []
    }

    const backend = process.env.PIAPI_DEV_PROXY ?? 'http://localhost:9200'
    const beforeFiles = [
      {
        source: '/piapi/:path*',
        destination: `${backend}/piapi/:path*`,
      },
      {
        source: `${adminBasePath}/piapi/:path*`,
        destination: `${backend}/piapi/:path*`,
      },
      {
        source: '/api/:path*',
        destination: `${backend}/piadmin/api/:path*`,
      },
      {
        source: `${adminBasePath}/api/:path*`,
        destination: `${backend}/piadmin/api/:path*`,
      },
    ]
    const afterFiles = [
      {
        source: `${adminBasePath}`,
        destination: '/',
      },
      {
        source: `${adminBasePath}/:path*`,
        destination: '/:path*',
      },
    ]
    return { beforeFiles, afterFiles }
  },
}

export default nextConfig
