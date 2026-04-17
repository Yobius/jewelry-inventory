'use client'

import { apiRequest } from '@/lib/api-client'
import { useAuthStore } from '@/lib/auth-store'
import { LOCATION_LABELS, formatDate, totalQuantity } from '@/lib/format'
import type { ItemsListResponse, Transaction, TransactionsListResponse } from '@/lib/types'
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

const TYPE_LABELS: Record<Transaction['type'], string> = {
  IN: 'Приход',
  OUT: 'Расход',
  MOVE: 'Перемещение',
  ADJUSTMENT: 'Корректировка',
}
const TYPE_COLORS: Record<Transaction['type'], string> = {
  IN: 'bg-green-50 text-green-700',
  OUT: 'bg-red-50 text-red-700',
  MOVE: 'bg-blue-50 text-blue-700',
  ADJUSTMENT: 'bg-amber-50 text-amber-700',
}

function formatMovement(tx: Transaction): string {
  const from = tx.movement.from ? LOCATION_LABELS[tx.movement.from] : null
  const to = tx.movement.to ? LOCATION_LABELS[tx.movement.to] : null
  if (from && to) return `${from} → ${to}`
  if (from) return `из ${from}`
  if (to) return `в ${to}`
  return '—'
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)

  const itemsQuery = useQuery<ItemsListResponse>({
    queryKey: ['items', { take: 50 }],
    queryFn: () => apiRequest<ItemsListResponse>('/api/items?take=50'),
  })

  const txQuery = useQuery<TransactionsListResponse>({
    queryKey: ['transactions'],
    queryFn: () => apiRequest<TransactionsListResponse>('/api/transactions?limit=20'),
  })

  const items = itemsQuery.data?.items ?? []
  const totalItems = items.length
  const totalStock = items.reduce((sum, item) => sum + totalQuantity(item.inventory?.quantities), 0)
  const totalValue = items.reduce((sum, item) => {
    const qty = totalQuantity(item.inventory?.quantities)
    return sum + qty * Number.parseFloat(item.pricing.unitPrice || '0')
  }, 0)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-neutral-900">Добро пожаловать, {user?.name}</h2>
        <p className="text-sm text-neutral-500">Обзор склада и последние движения</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Наименований</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-neutral-900">{totalItems}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Единиц на складе</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-neutral-900">{totalStock}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Общая стоимость</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-neutral-900">
              {totalValue.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₴
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Журнал движения товаров</CardTitle>
          <CardDescription>Последние 20 операций</CardDescription>
        </CardHeader>
        <CardContent>
          {txQuery.isLoading && (
            <p className="py-8 text-center text-sm text-neutral-500">Загрузка…</p>
          )}
          {txQuery.data?.transactions.length === 0 && (
            <p className="py-8 text-center text-sm text-neutral-500">Пока нет движений</p>
          )}
          {(txQuery.data?.transactions.length ?? 0) > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Товар</TableHead>
                  <TableHead>Операция</TableHead>
                  <TableHead>Кол-во</TableHead>
                  <TableHead>Маршрут</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txQuery.data?.transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-xs text-neutral-500">
                      {formatDate(tx.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {tx.item ? (
                        <>
                          <span className="font-mono text-xs text-neutral-400">{tx.item.sku}</span>{' '}
                          {tx.item.name}
                        </>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[tx.type]}`}
                      >
                        {TYPE_LABELS[tx.type]}
                      </span>
                    </TableCell>
                    <TableCell className="font-semibold">{tx.quantity}</TableCell>
                    <TableCell className="text-xs text-neutral-600">{formatMovement(tx)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
