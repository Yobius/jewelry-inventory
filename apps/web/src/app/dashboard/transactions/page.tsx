'use client'

import { apiRequest } from '@/lib/api-client'
import { LOCATION_LABELS, formatDate } from '@/lib/format'
import type { Transaction, TransactionsListResponse } from '@/lib/types'
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@jewelry/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { TransactionDialog } from './transaction-dialog'

const TYPE_COLORS: Record<Transaction['type'], string> = {
  IN: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  OUT: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  MOVE: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  ADJUSTMENT: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
}

function formatMovement(tx: Transaction): string {
  const from = tx.movement.from ? LOCATION_LABELS[tx.movement.from] : null
  const to = tx.movement.to ? LOCATION_LABELS[tx.movement.to] : null
  if (from && to) return `${from} → ${to}`
  if (from) return `${from} →`
  if (to) return `→ ${to}`
  return '—'
}

export default function TransactionsPage() {
  const [creating, setCreating] = useState(false)

  const query = useQuery<TransactionsListResponse>({
    queryKey: ['transactions'],
    queryFn: () => apiRequest<TransactionsListResponse>('/api/transactions?limit=100'),
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            Транзакции
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Приходы, отгрузки, перемещения
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>+ Новая транзакция</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Дата</TableHead>
            <TableHead>Товар</TableHead>
            <TableHead>Тип</TableHead>
            <TableHead>Кол-во</TableHead>
            <TableHead>Движение</TableHead>
            <TableHead>Причина</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.isLoading && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-neutral-500 dark:text-neutral-400">
                Загрузка…
              </TableCell>
            </TableRow>
          )}
          {query.data?.transactions.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-neutral-500 dark:text-neutral-400">
                Пока нет транзакций
              </TableCell>
            </TableRow>
          )}
          {query.data?.transactions.map((tx) => (
            <TableRow key={tx.id}>
              <TableCell className="text-xs text-neutral-600 dark:text-neutral-400">
                {formatDate(tx.createdAt)}
              </TableCell>
              <TableCell className="text-xs">
                {tx.item ? (
                  <div className="flex flex-col">
                    <span className="font-mono text-neutral-500 dark:text-neutral-400">
                      {tx.item.sku}
                    </span>
                    <span className="text-neutral-900 dark:text-neutral-100">{tx.item.name}</span>
                  </div>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell>
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[tx.type]}`}
                >
                  {tx.type}
                </span>
              </TableCell>
              <TableCell className="font-semibold">{tx.quantity}</TableCell>
              <TableCell className="text-xs">{formatMovement(tx)}</TableCell>
              <TableCell className="text-xs text-neutral-600 dark:text-neutral-400">
                {tx.reason ?? '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <TransactionDialog open={creating} onOpenChange={setCreating} />
    </div>
  )
}
