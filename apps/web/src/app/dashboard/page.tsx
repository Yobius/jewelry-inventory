'use client'

import { apiRequest } from '@/lib/api-client'
import { LOCATION_LABELS } from '@/lib/format'
import { useAuthStore } from '@/lib/auth-store'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@jewelry/ui'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'

type Stats = {
  today: { sales: number; units: number; revenue: string }
  week: { sales: number; units: number; revenue: string }
  inventory: {
    totalItems: number
    totalUnits: number
    byLocation: Record<string, number>
    lowStockCount: number
  }
  byMaterial: { material: string; items: number; units: number }[]
  topItemsWeek: { id: string; sku: string; name: string; sold: number }[]
  dailyRevenue: { date: string; revenue: string; sales: number }[]
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const q = useQuery<Stats>({
    queryKey: ['stats', 'dashboard'],
    queryFn: () => apiRequest<Stats>('/api/stats/dashboard'),
    refetchInterval: 30_000,
  })

  const s = q.data

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          Привіт, {user?.name}!
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Огляд магазину станом на {new Date().toLocaleString('uk-UA')}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <QuickAction
          href="/dashboard/pos"
          emoji="💳"
          title="Продати"
          subtitle="Відкрити касу"
          color="green"
        />
        <QuickAction
          href="/dashboard/imports"
          emoji="📦"
          title="Прихід товару"
          subtitle="Імпорт Excel-накладної"
          color="blue"
        />
        <QuickAction
          href="/dashboard/labels"
          emoji="🏷️"
          title="Друк бірок"
          subtitle="A4 + Code 128"
        />
        <QuickAction
          href="/dashboard/pricing"
          emoji="💰"
          title="Переоцінка"
          subtitle="Масово змінити ціни"
          adminOnly={user?.role !== 'ADMIN' && user?.role !== 'MANAGER'}
        />
      </div>

      {q.error && (
        <Card>
          <CardContent className="py-6 text-red-600 dark:text-red-400">
            Не вдалось завантажити статистику: {(q.error as Error).message}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard
          label="Продажі сьогодні"
          value={s ? `${s.today.revenue} ₴` : '…'}
          sub={s ? `${s.today.sales} чеків · ${s.today.units} од.` : ''}
          accent="green"
        />
        <KpiCard
          label="За 7 днів"
          value={s ? `${s.week.revenue} ₴` : '…'}
          sub={s ? `${s.week.sales} чеків · ${s.week.units} од.` : ''}
          accent="blue"
        />
        <KpiCard
          label="Товарів у складі"
          value={s ? s.inventory.totalUnits.toLocaleString('uk-UA') : '…'}
          sub={s ? `${s.inventory.totalItems.toLocaleString('uk-UA')} позицій` : ''}
        />
        <KpiCard
          label="Закінчується"
          value={s ? s.inventory.lowStockCount.toLocaleString('uk-UA') : '…'}
          sub="кількість ≤ 1"
          accent={s && s.inventory.lowStockCount > 0 ? 'amber' : undefined}
          href="/dashboard/labels"
        />
      </div>

      {s && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Виторг за 7 днів</CardTitle>
              <CardDescription>Сума OUT-транзакцій по днях</CardDescription>
            </CardHeader>
            <CardContent>
              <RevenueChart data={s.dailyRevenue} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>По локаціях</CardTitle>
              <CardDescription>Розподіл одиниць</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2 text-sm">
                {(['warehouse', 'point1', 'point2', 'point3'] as const).map((k) => {
                  const units = s.inventory.byLocation[k] ?? 0
                  const pct =
                    s.inventory.totalUnits > 0
                      ? (units / s.inventory.totalUnits) * 100
                      : 0
                  return (
                    <li key={k} className="flex flex-col gap-1">
                      <div className="flex justify-between">
                        <span className="text-neutral-700 dark:text-neutral-300">
                          {LOCATION_LABELS[k]}
                        </span>
                        <span className="font-mono font-medium text-neutral-900 dark:text-neutral-100">
                          {units.toLocaleString('uk-UA')}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-800">
                        <div
                          className="h-full rounded-full bg-neutral-900 dark:bg-neutral-100"
                          style={{ width: `${pct.toFixed(1)}%` }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

      {s && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Топ продажі (7 днів)</CardTitle>
              <CardDescription>Найчастіше продавані позиції</CardDescription>
            </CardHeader>
            <CardContent>
              {s.topItemsWeek.length === 0 ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Ще не було продажів за тиждень
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Назва</TableHead>
                      <TableHead className="text-right">Продано</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.topItemsWeek.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="font-mono text-xs">
                          <Link
                            href={`/dashboard/items?search=${encodeURIComponent(i.sku)}`}
                            className="text-neutral-900 underline-offset-2 hover:underline dark:text-neutral-100"
                          >
                            {i.sku}
                          </Link>
                        </TableCell>
                        <TableCell>{i.name}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {i.sold}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>По матеріалах</CardTitle>
              <CardDescription>Позицій та одиниць кожного типу</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Метал</TableHead>
                    <TableHead className="text-right">Позицій</TableHead>
                    <TableHead className="text-right">Одиниць</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.byMaterial.map((m) => (
                    <TableRow key={m.material}>
                      <TableCell>
                        <MaterialBadge material={m.material} />
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {m.items.toLocaleString('uk-UA')}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {m.units.toLocaleString('uk-UA')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

function KpiCard({
  label,
  value,
  sub,
  accent,
  href,
}: {
  label: string
  value: string
  sub?: string
  accent?: 'green' | 'blue' | 'amber'
  href?: string
}) {
  const accentClass =
    accent === 'green'
      ? 'text-green-700 dark:text-green-400'
      : accent === 'blue'
        ? 'text-blue-700 dark:text-blue-400'
        : accent === 'amber'
          ? 'text-amber-700 dark:text-amber-400'
          : 'text-neutral-900 dark:text-neutral-50'
  const inner = (
    <>
      <div className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${accentClass}`}>{value}</div>
      {sub && (
        <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{sub}</div>
      )}
    </>
  )
  const base =
    'block rounded-lg border border-neutral-200 bg-white p-4 shadow-sm transition dark:border-neutral-800 dark:bg-neutral-900'
  if (href) {
    return (
      <Link href={href} className={`${base} hover:border-neutral-400 dark:hover:border-neutral-700`}>
        {inner}
      </Link>
    )
  }
  return <div className={base}>{inner}</div>
}

function QuickAction({
  href,
  emoji,
  title,
  subtitle,
  color,
  adminOnly,
}: {
  href: string
  emoji: string
  title: string
  subtitle: string
  color?: 'green' | 'blue'
  adminOnly?: boolean
}) {
  if (adminOnly) return null
  const colorClass =
    color === 'green'
      ? 'hover:border-green-500 dark:hover:border-green-700'
      : color === 'blue'
        ? 'hover:border-blue-500 dark:hover:border-blue-700'
        : 'hover:border-neutral-500 dark:hover:border-neutral-500'
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm transition dark:border-neutral-800 dark:bg-neutral-900 ${colorClass}`}
    >
      <span className="text-3xl">{emoji}</span>
      <div className="flex flex-col">
        <span className="font-semibold text-neutral-900 dark:text-neutral-50">{title}</span>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</span>
      </div>
    </Link>
  )
}

function MaterialBadge({ material }: { material: string }) {
  const style: Record<string, string> = {
    GOLD: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
    SILVER: 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200',
    PLATINUM: 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200',
    OTHER: 'bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400',
  }
  return (
    <span
      className={`rounded-md px-2 py-0.5 text-xs font-medium ${style[material] ?? style.OTHER}`}
    >
      {material}
    </span>
  )
}

function RevenueChart({ data }: { data: { date: string; revenue: string; sales: number }[] }) {
  const max = Math.max(1, ...data.map((d) => Number(d.revenue)))
  const total = data.reduce((s, d) => s + Number(d.revenue), 0)
  return (
    <div>
      <div className="flex items-end gap-2 h-40">
        {data.map((d) => {
          const value = Number(d.revenue)
          const h = max > 0 ? (value / max) * 100 : 0
          const isToday = d.date === new Date().toISOString().slice(0, 10)
          return (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-1 items-end">
                <div
                  className={`w-full rounded-t ${
                    isToday
                      ? 'bg-neutral-900 dark:bg-neutral-100'
                      : 'bg-neutral-300 dark:bg-neutral-700'
                  }`}
                  style={{ height: `${Math.max(2, h)}%` }}
                  title={`${d.date}: ${d.revenue} ₴ · ${d.sales} чеків`}
                />
              </div>
              <div className="text-[10px] tabular-nums text-neutral-500 dark:text-neutral-400">
                {d.date.slice(5)}
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
        Сума за період:{' '}
        <span className="font-mono font-semibold text-neutral-900 dark:text-neutral-100">
          {total.toFixed(2)} ₴
        </span>
      </div>
    </div>
  )
}
