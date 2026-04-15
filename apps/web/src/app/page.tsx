'use client'

import { useAuthStore } from '@/lib/auth-store'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function HomePage() {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    router.replace(token ? '/dashboard' : '/login')
  }, [router, token])

  return null
}
