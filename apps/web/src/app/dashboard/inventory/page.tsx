'use client'

import { apiRequest } from '@/lib/api-client'
import { LOCATION_KEYS, LOCATION_LABELS, totalQuantity } from '@/lib/format'
import type { Item, ItemsListResponse, LocationKey } from '@/lib/types'
import {
  Button,
  Card,
  CardContent,
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
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { AdjustDialog } from './adjust-dialog'

type StockStats = {
  inventory: {
    totalItems: number
    totalUnits: number
    byLocation: Record<string, number>
    lowStockCount: number
  }
}

type SortKey = 'total' | 'warehouse' | 'point1' | 'point2' | 'point3' | 'sku'
type LocFilter = LocationKey | 'all' | 'low'

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const

export default function InventoryPage() {
  const [adjusting, setAdjusting] = useState<Item | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [locationFilter, setLocationFilter] = useState<LocFilter>('all')
  const [sortBy, setSortBy] = useState<SortKey>('total')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(50)

  // Debounce search — avoid re-fetching on every keystroke
  useEffect(() => {
    const h = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(h)
  }, [search])

  // Reset page to 1 when filters change
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset page on filter change
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, locationFilter, pageSize])

  // KPIs (not affected by pagination — always show full-store totals)
  const stats = useQuery<StockStats>({
    queryKey: ['stats', 'inventory'],
    queryFn: () => apiRequest<StockStats>('/api/stats/dashboard'),
    refetchInterval: 30_000,
  })

  // Build the `sort` query param for the API
  const serverSort = (() => {
    if (sortBy === 'sku') return sortDir === 'asc' ? 'sku_asc' : 'sku_desc'
    if (sortBy === 'total') return sortDir === 'asc' ? 'total_asc' : 'total_desc'
    // warehouse/point1/point2/point3 — API only supports DESC sort on these
    return `${sortBy}_desc`
  })()

  // Fetch the current page from the server with full filters + sort applied
  const skip = (page - 1) * pageSize
  const query = useQuery<ItemsListResponse>({
    queryKey: [
      'items',
      'inventory-page',
      debouncedSearch,
      skip,
      pageSize,
      locationFilter,
      serverSort,
    ],
    queryFn: () => {
      const p = new URLSearchParams()
      p.set('take', String(pageSize))
      p.set('skip', String(skip))
      if (debouncedSearch) p.set('search', debouncedSearch)
      if (locationFilter === 'low') p.set('lowStock', 'true')
      else if (locationFilter !== 'all') p.set('location', locationFilter)
      p.set('sort', serverSort)
      return apiRequest<ItemsListResponse>(`/api/items?${p.toString()}`)
    },
    placeholderData: keepPreviousData,
  })

  const visibleRows = query.data?.items ?? []

  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const rangeFrom = total === 0 ? 0 : skip + 1
  const rangeTo = Math.min(total, skip + (query.data?.items.length ?? 0))

  const byLoc = stats.data?.inventory.byLocation ?? {}
  const totalUnits = stats.data?.inventory.totalUnits ?? 0

  function toggleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(key)
      setSortDir('desc')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          Склад · залишки
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Скільки товару на кожній точці — всього та по кожній позиції
        </p>
      </div>

      {/* Big summary cards — один погляд і ясно де скільки */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <SummaryCard
          label="Всього одиниць"
          value={totalUnits}
          active={locationFilter === 'all'}
          onClick={() => setLocationFilter('all')}
        />
        {LOCATION_KEYS.map((k) => (
          <SummaryCard
            key={k}
            label={LOCATION_LABELS[k]}
            value={byLoc[k] ?? 0}
            active={locationFilter === k}
            onClick={() => setLocationFilter(k)}
          />
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Пошук та фільтри</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="search">Пошук (артикул, назва)</Label>
            <Input
              id="search"
              placeholder="Напр. «555» або «каблучка»…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="locf">Локація</Label>
            <Select
              id="locf"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value as LocFilter)}
            >
              <option value="all">Усі локації</option>
              {LOCATION_KEYS.map((k) => (
                <option key={k} value={k}>
                  Тільки на: {LOCATION_LABELS[k]}
                </option>
              ))}
              <option value="low">⚠️ Немає в наявності (total=0)</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pageSize">На сторінці</Label>
            <Select
              id="pageSize"
              value={String(pageSize)}
              onChange={(e) =>
                setPageSize(Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number])
              }
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      <Table>
        <TableHeader>
          <TableRow>
            <SortHead
              label="SKU / Назва"
              sortKey="sku"
              current={sortBy}
              dir={sortDir}
              onSort={toggleSort}
            />
            {LOCATION_KEYS.map((key) => (
              <SortHead
                key={key}
                label={LOCATION_LABELS[key]}
                sortKey={key}
                current={sortBy}
                dir={sortDir}
                onSort={toggleSort}
                align="right"
              />
            ))}
            <SortHead
              label="Всього"
              sortKey="total"
              current={sortBy}
              dir={sortDir}
              onSort={toggleSort}
              align="right"
            />
            <TableHead className="w-28" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.isLoading && !query.data && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-neutral-500 dark:text-neutral-400">
                Завантаження…
              </TableCell>
            </TableRow>
          )}
          {query.data && visibleRows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-neutral-500 dark:text-neutral-400">
                Нічого не знайдено на цій сторінці — спробуй інший фільтр
              </TableCell>
            </TableRow>
          )}
          {visibleRows.map((item) => {
            const q = item.inventory?.quantities ?? {}
            const totalQ = totalQuantity(q)
            return (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
                      {item.sku}
                    </span>
                    <span>{item.name}</span>
                  </div>
                </TableCell>
                <LocCell value={q.warehouse ?? 0} />
                <LocCell value={q.point1 ?? 0} />
                <LocCell value={q.point2 ?? 0} />
                <LocCell value={q.point3 ?? 0} />
                <TableCell className="text-right">
                  <span
                    className={`font-mono font-semibold ${
                      totalQ === 0
                        ? 'text-red-600 dark:text-red-400'
                        : totalQ <= 1
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-neutral-900 dark:text-neutral-100'
                    }`}
                  >
                    {totalQ}
                  </span>
                </TableCell>
                <TableCell>
                  <Button variant="outline" size="sm" onClick={() => setAdjusting(item)}>
                    Корекція
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        rangeFrom={rangeFrom}
        rangeTo={rangeTo}
        total={total}
        loading={query.isFetching}
      />

      <AdjustDialog
        item={adjusting}
        onOpenChange={(open) => {
          if (!open) setAdjusting(null)
        }}
      />
    </div>
  )
}

function SummaryCard({
  label,
  value,
  active,
  onClick,
}: {
  label: string
  value: number
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start rounded-lg border p-3 text-left transition ${
        active
          ? 'border-neutral-900 bg-neutral-50 dark:border-neutral-100 dark:bg-neutral-900'
          : 'border-neutral-200 bg-white hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-600'
      }`}
    >
      <span className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </span>
      <span className="mt-1 text-2xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
        {value.toLocaleString('uk-UA')}
      </span>
    </button>
  )
}

function LocCell({ value }: { value: number }) {
  return (
    <TableCell className="text-right font-mono">
      {value === 0 ? (
        <span className="text-neutral-300 dark:text-neutral-700">—</span>
      ) : (
        <span className="text-neutral-900 dark:text-neutral-100">{value}</span>
      )}
    </TableCell>
  )
}

function SortHead({
  label,
  sortKey,
  current,
  dir,
  onSort,
  align,
}: {
  label: string
  sortKey: SortKey
  current: SortKey
  dir: 'asc' | 'desc'
  onSort: (k: SortKey) => void
  align?: 'right'
}) {
  const active = current === sortKey
  return (
    <TableHead className={align === 'right' ? 'text-right' : undefined}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 ${
          active
            ? 'text-neutral-900 dark:text-neutral-100'
            : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
        }`}
      >
        {label}
        {active && <span className="text-xs">{dir === 'asc' ? '▲' : '▼'}</span>}
      </button>
    </TableHead>
  )
}

/**
 * Pagination bar. Shows page numbers with ellipsis, prev/next/first/last, and
 * a "X–Y з Z" counter. Stays visible even when `totalPages = 1`.
 */
function Pagination({
  page,
  totalPages,
  onPageChange,
  rangeFrom,
  rangeTo,
  total,
  loading,
}: {
  page: number
  totalPages: number
  onPageChange: (p: number) => void
  rangeFrom: number
  rangeTo: number
  total: number
  loading?: boolean
}) {
  const pages = buildPageList(page, totalPages)
  return (
    <div className="flex flex-col items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm dark:border-neutral-800 dark:bg-neutral-900 md:flex-row">
      <div className="text-neutral-600 dark:text-neutral-400">
        Показано{' '}
        <span className="font-mono font-semibold text-neutral-900 dark:text-neutral-100">
          {rangeFrom}–{rangeTo}
        </span>{' '}
        з{' '}
        <span className="font-mono font-semibold text-neutral-900 dark:text-neutral-100">
          {total.toLocaleString('uk-UA')}
        </span>
        {loading && (
          <span className="ml-2 text-xs text-neutral-500 dark:text-neutral-400">
            завантаження…
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <PageButton onClick={() => onPageChange(1)} disabled={page <= 1}>
          «
        </PageButton>
        <PageButton onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          ‹
        </PageButton>
        {pages.map((p, idx) =>
          typeof p === 'string' ? (
            <span
              key={`dots-${idx}`}
              className="px-2 text-xs text-neutral-400 dark:text-neutral-600"
            >
              …
            </span>
          ) : (
            <PageButton
              key={p}
              onClick={() => onPageChange(p)}
              active={p === page}
            >
              {p}
            </PageButton>
          ),
        )}
        <PageButton onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
          ›
        </PageButton>
        <PageButton onClick={() => onPageChange(totalPages)} disabled={page >= totalPages}>
          »
        </PageButton>
      </div>
    </div>
  )
}

function PageButton({
  children,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-w-8 rounded-md px-2 py-1 text-sm font-medium transition ${
        active
          ? 'bg-neutral-900 text-neutral-50 dark:bg-neutral-100 dark:text-neutral-900'
          : disabled
            ? 'cursor-not-allowed text-neutral-300 dark:text-neutral-700'
            : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * Build list of page numbers with ellipsis for a large range.
 * 1 2 3 4 5 ... 87  (current near start)
 * 1 ... 40 41 42 43 44 ... 87 (current in middle)
 * 1 ... 83 84 85 86 87 (current near end)
 */
function buildPageList(current: number, total: number): (number | 'gap-left' | 'gap-right')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const out: (number | 'gap-left' | 'gap-right')[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  if (start > 2) out.push('gap-left')
  for (let i = start; i <= end; i++) out.push(i)
  if (end < total - 1) out.push('gap-right')
  out.push(total)
  return out
}
