'use client'

import { apiRequest } from '@/lib/api-client'
import { LOCATION_LABELS, formatDate } from '@/lib/format'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@jewelry/ui'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

type SaleTx = {
  id: string
  createdAt: string
  quantity: number
  reason: string | null
  movement: { from?: string; to?: string }
  unitPrice: string
  total: string
  item: {
    id: string
    sku: string
    name: string
    material: string
    weight: string
  } | null
  user: { name: string; email: string } | null
}
type SalesResp = {
  transactions: SaleTx[]
  total: number
  totalRevenue: string
  totalUnits: number
}

type Supplier = { id: string; name: string }

const MATERIALS = ['GOLD', 'SILVER', 'PLATINUM', 'OTHER'] as const
const LOCATIONS = ['warehouse', 'point1', 'point2', 'point3'] as const

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export default function SalesPage() {
  const today = new Date()
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  const [from, setFrom] = useState(isoDay(weekAgo))
  const [to, setTo] = useState(isoDay(today))
  const [location, setLocation] = useState<string>('')
  const [supplierId, setSupplierId] = useState<string>('')
  const [material, setMaterial] = useState<string>('')

  const queryKey = useMemo(
    () => ['sales', from, to, location, supplierId, material],
    [from, to, location, supplierId, material],
  )

  const sales = useQuery<SalesResp>({
    queryKey,
    queryFn: () => {
      const p = new URLSearchParams()
      if (from) p.set('from', `${from}T00:00:00`)
      if (to) {
        // Add 1 day so `to` is inclusive
        const end = new Date(to)
        end.setDate(end.getDate() + 1)
        p.set('to', end.toISOString())
      }
      if (location) p.set('location', location)
      if (supplierId) p.set('supplierId', supplierId)
      if (material) p.set('material', material)
      p.set('take', '200')
      return apiRequest<SalesResp>(`/api/stats/sales?${p.toString()}`)
    },
  })

  const suppliers = useQuery<{ items: Supplier[]; total: number }>({
    queryKey: ['suppliers', 'all'],
    queryFn: () => apiRequest('/api/suppliers?take=200'),
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          Історія продажів
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Всі OUT-транзакції з фільтрами за період / локацією / постачальником
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Фільтр</CardTitle>
          <CardDescription>За замовчуванням — останні 7 днів</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="from">З</Label>
              <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="to">По</Label>
              <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="loc">Локація</Label>
              <Select id="loc" value={location} onChange={(e) => setLocation(e.target.value)}>
                <option value="">— всі —</option>
                {LOCATIONS.map((l) => (
                  <option key={l} value={l}>
                    {LOCATION_LABELS[l]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mat">Метал</Label>
              <Select id="mat" value={material} onChange={(e) => setMaterial(e.target.value)}>
                <option value="">— всі —</option>
                {MATERIALS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sup">Постачальник</Label>
              <Select id="sup" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">— всі —</option>
                {suppliers.data?.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {sales.data && (
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Чеків" value={sales.data.transactions.length.toLocaleString('uk-UA')} />
          <Stat label="Одиниць" value={sales.data.totalUnits.toLocaleString('uk-UA')} />
          <Stat label="Виторг, ₴" value={sales.data.totalRevenue} accent="green" />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Транзакції</CardTitle>
          <CardDescription>
            {sales.data ? `Показано ${sales.data.transactions.length} з ${sales.data.total}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>SKU / Назва</TableHead>
                <TableHead>Матеріал</TableHead>
                <TableHead>Локація</TableHead>
                <TableHead className="text-right">К-сть</TableHead>
                <TableHead className="text-right">Ціна</TableHead>
                <TableHead className="text-right">Сума</TableHead>
                <TableHead>Продавець</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.isLoading && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-neutral-500 dark:text-neutral-400"
                  >
                    Завантаження…
                  </TableCell>
                </TableRow>
              )}
              {sales.data?.transactions.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-neutral-500 dark:text-neutral-400"
                  >
                    Немає продажів за обраний період
                  </TableCell>
                </TableRow>
              )}
              {sales.data?.transactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {formatDate(t.createdAt)}
                  </TableCell>
                  <TableCell>
                    {t.item ? (
                      <div className="flex flex-col">
                        <span className="font-mono text-xs text-neutral-500">{t.item.sku}</span>
                        <span>{t.item.name}</span>
                      </div>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{t.item?.material ?? '—'}</TableCell>
                  <TableCell className="text-xs">
                    {t.movement?.from
                      ? (LOCATION_LABELS[t.movement.from as keyof typeof LOCATION_LABELS] ??
                        t.movement.from)
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono">{t.quantity}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{t.unitPrice}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{t.total}</TableCell>
                  <TableCell className="text-xs text-neutral-500">{t.user?.name ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: 'green'
}) {
  const toneClass =
    accent === 'green'
      ? 'text-green-700 dark:text-green-400'
      : 'text-neutral-900 dark:text-neutral-50'
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  )
}
