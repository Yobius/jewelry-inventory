'use client'

import { apiRequest } from '@/lib/api-client'
import { LOCATION_LABELS, MATERIAL_LABELS, totalQuantity } from '@/lib/format'
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
import { useMemo, useState } from 'react'
import { ItemFormDialog } from './item-form-dialog'

const UNCATEGORIZED = 'Без категорії'

function groupByCategory(items: Item[]): Map<string, Item[]> {
  const groups = new Map<string, Item[]>()
  for (const item of items) {
    const cat = item.category || UNCATEGORIZED
    const list = groups.get(cat)
    if (list) {
      list.push(item)
    } else {
      groups.set(cat, [item])
    }
  }
  return groups
}

export default function ItemsPage() {
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const query = useQuery<ItemsListResponse>({
    queryKey: ['items', { search }],
    queryFn: () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      params.set('take', '200')
      return apiRequest<ItemsListResponse>(`/api/items?${params.toString()}`)
    },
  })

  const groups = useMemo(() => groupByCategory(query.data?.items ?? []), [query.data])
  const categoryNames = useMemo(() => Array.from(groups.keys()).sort(), [groups])

  const toggle = (cat: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">Товари</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Каталог виробів по категоріях
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>+ Новий товар</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Пошук</CardTitle>
          <CardDescription>За SKU або назвою</CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Введіть SKU або назву…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </CardContent>
      </Card>

      {query.isLoading && (
        <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
          Завантаження…
        </p>
      )}

      {query.data && categoryNames.length === 0 && (
        <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
          Нічого не знайдено
        </p>
      )}

      {categoryNames.map((cat) => {
        const items = groups.get(cat) ?? []
        const isCollapsed = collapsed.has(cat)
        const groupTotal = items.reduce(
          (sum, item) => sum + totalQuantity(item.inventory?.quantities),
          0,
        )
        return (
          <div key={cat} className="flex flex-col gap-0">
            <button
              type="button"
              onClick={() => toggle(cat)}
              className="flex items-center justify-between rounded-t-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-left transition hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{isCollapsed ? '▸' : '▾'}</span>
                <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                  {cat}
                </span>
                <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                  {items.length}
                </span>
              </div>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                На складі: {groupTotal} шт.
              </span>
            </button>

            {!isCollapsed && (
              <Table className="rounded-b-lg border border-t-0 border-neutral-200 dark:border-neutral-800">
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Назва</TableHead>
                    <TableHead>Матеріал</TableHead>
                    <TableHead>Проба</TableHead>
                    <TableHead>Вага</TableHead>
                    <TableHead>Залишки</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const q = item.inventory?.quantities ?? {}
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                        <TableCell>{item.name}</TableCell>
                        <TableCell className="text-xs">
                          {MATERIAL_LABELS[item.material] ?? item.material}
                        </TableCell>
                        <TableCell className="text-sm text-neutral-600 dark:text-neutral-400">
                          {item.carat ?? '—'}
                        </TableCell>
                        <TableCell>{item.weight} г</TableCell>
                        <TableCell>
                          <div className="flex flex-col text-xs text-neutral-600 dark:text-neutral-400">
                            <span className="font-medium text-neutral-900 dark:text-neutral-100">
                              Всього: {totalQuantity(q)}
                            </span>
                            <span>
                              {LOCATION_LABELS.warehouse}: {q.warehouse ?? 0} ·{' '}
                              {LOCATION_LABELS.point1}: {q.point1 ?? 0}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" onClick={() => setEditing(item)}>
                            Змінити
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        )
      })}

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
