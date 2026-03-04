import type { NextConfig } from 'next'

// Set NEXT_EXPORT=true for Tauri production builds (static export, no server)
// In dev (`npm run dev` / `tauri dev`) leave unset — proxy handles CORS
const isExport = process.env.NEXT_EXPORT === 'true'

const nextConfig: NextConfig = {
  ...(isExport ? { output: 'export' } : {}),
  images: { unoptimized: true },
  // Dev proxy: forwards /api/* to production backend, bypassing browser CORS
  ...(!isExport ? {
    async rewrites() {
      return [
        {
          source: '/api/:path*',
          destination: 'https://exp-admin.smartalmaty.kz/api/:path*',
        },
      ]
    },
  } : {}),
}

export default nextConfig
