/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production'

const adminBasePath = '/piadmin'

const nextConfig = {
  output: isProd ? 'export' : undefined,
  basePath: adminBasePath,
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
    return [
      {
        source: '/api/:path*',
        destination: `${backend}/piadmin/api/:path*`,
      },
    ]
  },
}

export default nextConfig
