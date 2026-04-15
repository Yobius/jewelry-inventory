'use client'

import { useAuthStore } from '@/lib/auth-store'
import { Button } from '@jewelry/ui'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { type ReactNode, useEffect } from 'react'

const nav = [
  { href: '/dashboard', label: 'Обзор' },
  { href: '/dashboard/items', label: 'Товары' },
  { href: '/dashboard/inventory', label: 'Склад' },
  { href: '/dashboard/transactions', label: 'Транзакции' },
  { href: '/dashboard/reports', label: 'Отчёты' },
  { href: '/dashboard/scan', label: 'QR-сканер' },
]

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const clear = useAuthStore((s) => s.clear)

  useEffect(() => {
    if (!token) router.replace('/login')
  }, [router, token])

  if (!token) return null

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r border-neutral-200 bg-white p-6">
        <h1 className="mb-8 text-lg font-semibold text-neutral-900">Jewelry Inventory</h1>
        <nav className="flex flex-col gap-1 text-sm">
          {nav.map((link) => {
            const active = pathname === link.href
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  active
                    ? 'rounded-md bg-neutral-100 px-3 py-2 font-medium text-neutral-900'
                    : 'rounded-md px-3 py-2 text-neutral-600 hover:bg-neutral-50'
                }
              >
                {link.label}
              </Link>
            )
          })}
        </nav>
        <div className="mt-8 border-t border-neutral-200 pt-6">
          <p className="text-sm font-medium text-neutral-900">{user?.name}</p>
          <p className="text-xs text-neutral-500">{user?.email}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            onClick={() => {
              clear()
              router.replace('/login')
            }}
          >
            Выйти
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
