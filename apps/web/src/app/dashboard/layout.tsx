'use client'

import { type AuthUser, useAuthStore } from '@/lib/auth-store'
import { ThemeToggle } from '@/lib/theme-toggle'
import { useInventoryStream } from '@/lib/use-inventory-stream'
import { Button } from '@jewelry/ui'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { type ReactNode, useEffect } from 'react'

type Role = AuthUser['role']

type NavItem = {
  href: string
  label: string
  /** Roles allowed to see this link. If omitted, visible to all authenticated users. */
  roles?: Role[]
}

const WRITE: Role[] = ['ADMIN', 'MANAGER']

const nav: NavItem[] = [
  { href: '/dashboard', label: 'Огляд' },
  { href: '/dashboard/pos', label: 'Каса (POS)', roles: ['ADMIN', 'MANAGER', 'SELLER', 'CASHIER'] },
  { href: '/dashboard/sales', label: 'Продажі' },
  { href: '/dashboard/items', label: 'Товари' },
  { href: '/dashboard/inventory', label: 'Склад' },
  { href: '/dashboard/transactions', label: 'Транзакції' },
  { href: '/dashboard/imports', label: 'Імпорт Excel', roles: WRITE },
  { href: '/dashboard/pricing', label: 'Переоцінка', roles: WRITE },
  { href: '/dashboard/labels', label: 'Друк бірок' },
  { href: '/dashboard/reports', label: 'Звіти' },
  { href: '/dashboard/scan', label: 'QR-сканер' },
  { href: '/dashboard/users', label: 'Користувачі', roles: ['ADMIN'] },
]

const ROLE_BADGE: Record<Role, string> = {
  ADMIN: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  MANAGER: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  SELLER: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  CASHIER: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  AUDITOR: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const accessConfirmed = useAuthStore((s) => s.accessConfirmed)
  const clear = useAuthStore((s) => s.clear)

  useEffect(() => {
    if (!token) router.replace('/login')
    else if (!accessConfirmed) router.replace('/access-code')
  }, [router, token, accessConfirmed])

  useInventoryStream()

  if (!token || !user || !accessConfirmed) return null

  const visibleNav = nav.filter((n) => !n.roles || n.roles.includes(user.role))

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 flex-col border-r border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950">
        <h1 className="mb-8 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
          Jewelry Inventory
        </h1>
        <nav className="flex flex-col gap-1 text-sm">
          {visibleNav.map((link) => {
            const active = pathname === link.href
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  active
                    ? 'rounded-md bg-neutral-100 px-3 py-2 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-50'
                    : 'rounded-md px-3 py-2 text-neutral-600 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-neutral-900'
                }
              >
                {link.label}
              </Link>
            )
          })}
        </nav>
        <div className="mt-auto border-t border-neutral-200 pt-6 dark:border-neutral-800">
          <div className="mb-2 flex items-center gap-2">
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {user.name}
            </p>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${ROLE_BADGE[user.role]}`}
              title={user.role}
            >
              {user.role}
            </span>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{user.email}</p>
          <ThemeToggle className="mt-3 w-full" />
          <Button
            variant="outline"
            size="sm"
            className="mt-2 w-full"
            onClick={() => {
              clear()
              router.replace('/login')
            }}
          >
            Вийти
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
