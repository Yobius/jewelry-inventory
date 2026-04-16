'use client'

import { apiRequest } from '@/lib/api-client'
import { LOCATION_LABELS, totalQuantity } from '@/lib/format'
import type { Item, ItemsListResponse } from '@/lib/types'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@jewelry/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ItemFormDialog } from './item-form-dialog'

export default function ItemsPage() {
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)

  const query = useQuery<ItemsListResponse>({
    queryKey: ['items', { search }],
    queryFn: () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      params.set('take', '50')
      return apiRequest<ItemsListResponse>(`/api/items?${params.toString()}`)
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-neutral-900">Товары</h2>
          <p className="text-sm text-neutral-500">Каталог украшений с остатками</p>
        </div>
        <Button onClick={() => setCreating(true)}>+ Новый товар</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Поиск</CardTitle>
          <CardDescription>По SKU или названию</CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Введите SKU или название…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </CardContent>
      </Card>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU</TableHead>
            <TableHead>Название</TableHead>
            <TableHead>Материал</TableHead>
            <TableHead>Вес</TableHead>
            <TableHead>Остатки</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.isLoading && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-neutral-500">
                Загрузка…
              </TableCell>
            </TableRow>
          )}
          {query.data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-neutral-500">
                Ничего не найдено
              </TableCell>
            </TableRow>
          )}
          {query.data?.items.map((item) => {
            const q = item.inventory?.quantities ?? {}
            return (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                <TableCell>{item.name}</TableCell>
                <TableCell>
                  {item.material}
                  {item.carat ? (
                    <span className="ml-1 text-xs text-neutral-500">· {item.carat}</span>
                  ) : null}
                </TableCell>
                <TableCell>{item.weight} г</TableCell>
                <TableCell>
                  <div className="flex flex-col text-xs text-neutral-600">
                    <span className="font-medium text-neutral-900">Всего: {totalQuantity(q)}</span>
                    <span>
                      {LOCATION_LABELS.warehouse}: {q.warehouse ?? 0} · {LOCATION_LABELS.point1}:{' '}
                      {q.point1 ?? 0}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Button variant="outline" size="sm" onClick={() => setEditing(item)}>
                    Изменить
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <ItemFormDialog open={creating} onOpenChange={setCreating} />
      <ItemFormDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        initialItem={editing}
      />
    </div>
  )
}
