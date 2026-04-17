import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@jewelry/ui'],
  env: {
    // Default empty = same-origin (nginx proxies /api|/auth|/health).
    // In dev, set NEXT_PUBLIC_API_URL=http://localhost:4000 via apps/web/.env.local.
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? '',
  },
}

export default config
