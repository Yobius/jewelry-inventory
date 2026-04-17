'use client'

import { apiBaseUrl, apiRequest } from '@/lib/api-client'
import { useAuthStore } from '@/lib/auth-store'
import {
  Alert,
  Button,
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

type Item = {
  id: string
  sku: string
  name: string
  material: string
  carat: number | null
  weight: string
  pricing: { unitPrice: string; perGram: string }
}
type ItemsList = { items: Item[]; total: number }

type PrintJob = {
  id: string
  copies: number
  status: 'QUEUED' | 'PRINTED' | 'CANCELLED'
  createdAt: string
  item: { id: string; sku: string; name: string; material: string; weight: string }
}
type JobsList = { jobs: PrintJob[] }

const FORMATS = ['25x35', '25x40', '40x60', '50x30'] as const
type Format = (typeof FORMATS)[number]

export default function LabelsPage() {
  const qc = useQueryClient()
  const token = useAuthStore((s) => s.token)

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Record<string, number>>({}) // itemId → copies
  const [format, setFormat] = useState<Format>('25x35')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const items = useQuery<ItemsList>({
    queryKey: ['items', 'labels', search],
    queryFn: () => {
      const p = new URLSearchParams()
      p.set('take', '100')
      if (search) p.set('search', search)
      return apiRequest<ItemsList>(`/api/items?${p.toString()}`)
    },
  })

  const jobs = useQuery<JobsList>({
    queryKey: ['print-jobs', 'queued'],
    queryFn: () => apiRequest<JobsList>('/api/labels/print-jobs?status=QUEUED'),
  })

  const addAllQueued = useMutation<{ added: number }, Error, void>({
    mutationFn: async () => {
      const j = await apiRequest<JobsList>('/api/labels/print-jobs?status=QUEUED')
      const next = { ...selected }
      for (const job of j.jobs) {
        next[job.item.id] = (next[job.item.id] ?? 0) + job.copies
      }
      setSelected(next)
      return { added: j.jobs.length }
    },
  })

  const markPrinted = useMutation<{ markedPrinted: number }, Error, string[]>({
    mutationFn: (ids) =>
      apiRequest('/api/labels/print-jobs/mark-printed', {
        method: 'POST',
        body: { ids },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['print-jobs'] }),
  })

  const totalLabels = Object.values(selected).reduce((a, b) => a + b, 0)
  const canDownload = totalLabels > 0 && !busy

  async function downloadPdf(alsoEnqueue: boolean) {
    setBusy(true)
    setError(null)
    try {
      const body = {
        format,
        enqueue: alsoEnqueue,
        items: Object.entries(selected)
          .filter(([, c]) => c > 0)
          .map(([itemId, copies]) => ({ itemId, copies })),
      }
      const res = await fetch(`${apiBaseUrl}/api/labels/pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(`PDF (${res.status}): ${txt.slice(0, 200)}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `labels-${format}-${Date.now()}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      if (alsoEnqueue) qc.invalidateQueries({ queryKey: ['print-jobs'] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF помилка')
    } finally {
      setBusy(false)
    }
  }

  function setCopies(itemId: string, copies: number) {
    setSelected((s) => {
      const next = { ...s }
      if (copies <= 0) delete next[itemId]
      else next[itemId] = copies
      return next
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          Друк бірок (A4 + Code 128)
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Обери товари → вкажи кількість копій → отримай PDF із сіткою бірок.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Налаштування друку</CardTitle>
          <CardDescription>Формат бірки й додаткові опції</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 md:flex-row md:items-end">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="format">Формат (мм)</Label>
            <Select
              id="format"
              value={format}
              onChange={(e) => setFormat(e.target.value as Format)}
            >
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5 md:flex-1">
            <Label>Обрано бірок</Label>
            <div className="rounded-md border border-neutral-200 px-3 py-2 font-mono text-sm dark:border-neutral-800">
              {totalLabels} (унікальних товарів: {Object.keys(selected).length})
            </div>
          </div>
          <Button onClick={() => downloadPdf(false)} disabled={!canDownload}>
            {busy ? 'Генеруємо PDF…' : 'Скачати PDF'}
          </Button>
          <Button
            variant="outline"
            onClick={() => downloadPdf(true)}
            disabled={!canDownload}
          >
            Скачати + записати в чергу
          </Button>
        </CardContent>
      </Card>

      {error && <Alert variant="destructive">{error}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>Каталог</CardTitle>
          <CardDescription>Знайди товар — натисни кількість для друку</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Input
            placeholder="Пошук по SKU або назві…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {jobs.data && jobs.data.jobs.length > 0 && (
            <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950">
              <span className="text-amber-900 dark:text-amber-200">
                У черзі друку: {jobs.data.jobs.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => addAllQueued.mutate()}
                disabled={addAllQueued.isPending}
              >
                Додати всі в поточний друк
              </Button>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Назва</TableHead>
                <TableHead className="text-right">Вага</TableHead>
                <TableHead className="text-right">Ціна</TableHead>
                <TableHead className="w-32 text-center">Копій</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.isLoading && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-neutral-500 dark:text-neutral-400"
                  >
                    Завантаження…
                  </TableCell>
                </TableRow>
              )}
              {items.data?.items.map((item) => {
                const copies = selected[item.id] ?? 0
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {item.weight} г
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {item.pricing?.unitPrice ?? '—'} ₴
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCopies(item.id, copies - 1)}
                          disabled={copies === 0}
                        >
                          −
                        </Button>
                        <span className="w-8 font-mono text-sm">{copies}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCopies(item.id, copies + 1)}
                        >
                          +
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {jobs.data && jobs.data.jobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Черга друку ({jobs.data.jobs.length})</CardTitle>
            <CardDescription>Записи, які раніше додавали в чергу</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Товар</TableHead>
                  <TableHead className="text-right">Копій</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.data.jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="text-xs text-neutral-600 dark:text-neutral-400">
                      {new Date(job.createdAt).toLocaleString('uk-UA')}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="font-mono text-xs">{job.item.sku}</div>
                      <div>{job.item.name}</div>
                    </TableCell>
                    <TableCell className="text-right">{job.copies}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => markPrinted.mutate([job.id])}
                        disabled={markPrinted.isPending}
                      >
                        Надруковано
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
