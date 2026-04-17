'use client'

import { apiRequest } from '@/lib/api-client'
import { LOCATION_LABELS, MATERIAL_KEYS, MATERIAL_LABELS, totalQuantity } from '@/lib/format'
import type { Item, ItemsListResponse, Material } from '@/lib/types'
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

function groupByMaterial(items: Item[]): Record<Material, Item[]> {
  const groups: Record<Material, Item[]> = { GOLD: [], SILVER: [], PLATINUM: [], OTHER: [] }
  for (const item of items) {
    groups[item.material].push(item)
  }
  return groups
}

export default function ItemsPage() {
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [collapsed, setCollapsed] = useState<Partial<Record<Material, boolean>>>({})

  const query = useQuery<ItemsListResponse>({
    queryKey: ['items', { search }],
    queryFn: () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      params.set('take', '50')
      return apiRequest<ItemsListResponse>(`/api/items?${params.toString()}`)
    },
  })

  const groups = useMemo(() => groupByMaterial(query.data?.items ?? []), [query.data])

  const toggle = (mat: Material) => setCollapsed((prev) => ({ ...prev, [mat]: !prev[mat] }))

  const nonEmptyGroups = MATERIAL_KEYS.filter((k) => groups[k].length > 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">Товары</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Каталог украшений с остатками
          </p>
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

      {query.isLoading && <p className="py-8 text-center text-sm text-neutral-500">Загрузка…</p>}

      {query.data && nonEmptyGroups.length === 0 && (
        <p className="py-8 text-center text-sm text-neutral-500">Ничего не найдено</p>
      )}

      {nonEmptyGroups.map((material) => {
        const items = groups[material]
        const isCollapsed = collapsed[material] === true
        const groupTotal = items.reduce(
          (sum, item) => sum + totalQuantity(item.inventory?.quantities),
          0,
        )
        return (
          <div key={material} className="flex flex-col gap-0">
            <button
              type="button"
              onClick={() => toggle(material)}
              className="flex items-center justify-between rounded-t-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-left transition hover:bg-neutral-100"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{isCollapsed ? '▸' : '▾'}</span>
                <span className="text-sm font-semibold text-neutral-900">
                  {MATERIAL_LABELS[material]}
                </span>
                <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-700">
                  {items.length}
                </span>
              </div>
              <span className="text-xs text-neutral-500">Всего на складе: {groupTotal} шт.</span>
            </button>

            {!isCollapsed && (
              <Table className="rounded-b-lg border border-t-0 border-neutral-200">
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Название</TableHead>
                    <TableHead>Проба</TableHead>
                    <TableHead>Вес</TableHead>
                    <TableHead>Остатки</TableHead>
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
                        <TableCell className="text-sm text-neutral-600">
                          {item.carat ?? '—'}
                        </TableCell>
                        <TableCell>{item.weight} г</TableCell>
                        <TableCell>
                          <div className="flex flex-col text-xs text-neutral-600">
                            <span className="font-medium text-neutral-900">
                              Всего: {totalQuantity(q)}
                            </span>
                            <span>
                              {LOCATION_LABELS.warehouse}: {q.warehouse ?? 0} ·{' '}
                              {LOCATION_LABELS.point1}: {q.point1 ?? 0}
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
