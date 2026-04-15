'use client'

import { apiRequest } from '@/lib/api-client'
import { LOCATION_KEYS, LOCATION_LABELS, totalQuantity } from '@/lib/format'
import type { Item, ItemsListResponse } from '@/lib/types'
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@jewelry/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { AdjustDialog } from './adjust-dialog'

export default function InventoryPage() {
  const [adjusting, setAdjusting] = useState<Item | null>(null)

  const query = useQuery<ItemsListResponse>({
    queryKey: ['items', { take: 100 }],
    queryFn: () => apiRequest<ItemsListResponse>('/api/items?take=100'),
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-neutral-900">Склад</h2>
        <p className="text-sm text-neutral-500">Остатки по локациям</p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU / Название</TableHead>
            {LOCATION_KEYS.map((key) => (
              <TableHead key={key}>{LOCATION_LABELS[key]}</TableHead>
            ))}
            <TableHead>Всего</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.isLoading && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-neutral-500">
                Загрузка…
              </TableCell>
            </TableRow>
          )}
          {query.data?.items.map((item) => {
            const q = item.inventory?.quantities ?? {}
            return (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-mono text-xs text-neutral-500">{item.sku}</span>
                    <span>{item.name}</span>
                  </div>
                </TableCell>
                <TableCell>{q.warehouse ?? 0}</TableCell>
                <TableCell>{q.point1 ?? 0}</TableCell>
                <TableCell>{q.point2 ?? 0}</TableCell>
                <TableCell>{q.point3 ?? 0}</TableCell>
                <TableCell className="font-semibold">{totalQuantity(q)}</TableCell>
                <TableCell>
                  <Button variant="outline" size="sm" onClick={() => setAdjusting(item)}>
                    Коррекция
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <AdjustDialog
        item={adjusting}
        onOpenChange={(open) => {
          if (!open) setAdjusting(null)
        }}
      />
    </div>
  )
}
