'use client'

import { apiBaseUrl } from '@/lib/api-client'
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
import { useEffect, useMemo, useRef, useState } from 'react'

type ItemField =
  | 'sku'
  | 'name'
  | 'material'
  | 'carat'
  | 'weight'
  | 'unitPrice'
  | 'perGram'
  | 'barcode'
  | 'quantity'
  | 'tags'
  | 'manufacturer'
  | 'stones'

const ITEM_FIELDS: { key: ItemField; label: string; required?: boolean }[] = [
  { key: 'sku', label: 'Артикул (SKU)', required: true },
  { key: 'name', label: 'Назва' },
  { key: 'material', label: 'Метал' },
  { key: 'carat', label: 'Проба' },
  { key: 'weight', label: 'Вага (г)', required: true },
  { key: 'unitPrice', label: 'Ціна за одиницю' },
  { key: 'perGram', label: 'Ціна за грам' },
  { key: 'barcode', label: 'Штрих-код' },
  { key: 'quantity', label: 'Кількість' },
  { key: 'tags', label: 'Категорія / теги' },
  { key: 'manufacturer', label: 'Виробник' },
  { key: 'stones', label: 'Камені' },
]

type PreviewResponse = {
  sheetName: string
  headers: string[]
  rowCount: number
  sampleRows: Record<string, string | number | null>[]
  autoMapping: Partial<Record<ItemField, string>>
}

type ExecuteResponse = {
  importId: string
  rowsTotal: number
  rowsCreated: number
  rowsUpdated: number
  rowsSkipped: number
  errors: { row: number; message: string }[]
}

type Supplier = { id: string; name: string }
type SupplierList = { items: Supplier[]; total: number }
type ImportLogEntry = {
  id: string
  filename: string
  rowsTotal: number
  rowsCreated: number
  rowsUpdated: number
  rowsSkipped: number
  status: string
  createdAt: string
  supplier?: Supplier | null
  user?: { id: string; name: string; email: string } | null
}
type ImportsList = { imports: ImportLogEntry[] }

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = useAuthStore.getState().token
  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  return res
}

async function apiJson<T>(path: string): Promise<T> {
  const res = await authedFetch(path)
  const txt = await res.text()
  const j = txt ? (JSON.parse(txt) as unknown) : null
  if (!res.ok) {
    const msg =
      j && typeof j === 'object' && 'error' in j
        ? String((j as { error: unknown }).error)
        : `Request failed (${res.status})`
    throw new Error(msg)
  }
  return j as T
}

export default function ImportsPage() {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [supplierId, setSupplierId] = useState<string>('')
  const [location, setLocation] = useState<'warehouse' | 'point1' | 'point2' | 'point3'>(
    'warehouse',
  )
  const [defaultQty, setDefaultQty] = useState(1)
  const [saveMappingAs, setSaveMappingAs] = useState('')
  const [mapping, setMapping] = useState<Partial<Record<ItemField, string>>>({})

  const suppliers = useQuery<SupplierList>({
    queryKey: ['suppliers', 'all'],
    queryFn: () => apiJson<SupplierList>('/api/suppliers?take=200'),
  })

  const pastImports = useQuery<ImportsList>({
    queryKey: ['imports', 'log'],
    queryFn: () => apiJson<ImportsList>('/api/imports'),
  })

  const [skuCheck, setSkuCheck] = useState<{
    existing: string[]
    missing: string[]
  } | null>(null)
  const [skuCheckLoading, setSkuCheckLoading] = useState(false)

  const preview = useMutation<PreviewResponse, Error, File>({
    mutationFn: async (f) => {
      const fd = new FormData()
      fd.append('file', f)
      const res = await authedFetch('/api/imports/excel/preview', { method: 'POST', body: fd })
      const j = (await res.json()) as unknown
      if (!res.ok) {
        throw new Error((j as { error?: string }).error ?? `Preview failed (${res.status})`)
      }
      return j as PreviewResponse
    },
    onSuccess: (data) => {
      setMapping({ ...data.autoMapping })
    },
  })

  // After preview + when user picks sku column: check which SKUs from sample rows
  // already exist in DB, so user knows what's new vs update.
  const previewData = preview.data
  useEffect(() => {
    const run = async () => {
      setSkuCheck(null)
      const skuCol = mapping.sku
      if (!skuCol || !previewData) return
      const skus = previewData.sampleRows
        .map((r) => r[skuCol])
        .filter((v): v is string | number => v != null)
        .map((v) => String(v).trim())
        .filter(Boolean)
      if (skus.length === 0) return
      setSkuCheckLoading(true)
      try {
        const res = await authedFetch('/api/items/exists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skus }),
        })
        if (res.ok) {
          const j = (await res.json()) as { existing: string[]; missing: string[] }
          setSkuCheck(j)
        }
      } finally {
        setSkuCheckLoading(false)
      }
    }
    void run()
  }, [mapping.sku, previewData])

  const execute = useMutation<ExecuteResponse, Error, void>({
    mutationFn: async () => {
      if (!file) throw new Error('Файл не обрано')
      if (!mapping.sku) throw new Error('Не вказано колонку для SKU')
      if (!mapping.weight) throw new Error('Не вказано колонку для ваги')

      const fd = new FormData()
      fd.append('file', file)
      fd.append(
        'params',
        JSON.stringify({
          supplierId: supplierId || undefined,
          saveMappingAs: saveMappingAs.trim() || undefined,
          fieldMapping: mapping,
          initialLocation: location,
          defaultQuantity: defaultQty,
          skipInvalid: true,
        }),
      )
      const res = await authedFetch('/api/imports/excel/execute', {
        method: 'POST',
        body: fd,
      })
      const j = (await res.json()) as unknown
      if (!res.ok) {
        throw new Error((j as { error?: string }).error ?? `Execute failed (${res.status})`)
      }
      return j as ExecuteResponse
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['imports'] })
      qc.invalidateQueries({ queryKey: ['items'] })
    },
  })

  const mappedCount = useMemo(() => Object.values(mapping).filter(Boolean).length, [mapping])

  useEffect(() => {
    if (file && !preview.data) preview.mutate(file)
  }, [file, preview])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          Імпорт з Excel
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Завантажте накладну постачальника у форматі .xlsx — система автоматично впізнає колонки та
          створить товари.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Файл та параметри</CardTitle>
          <CardDescription>
            {file ? (
              <>
                Обрано: <span className="font-medium">{file.name}</span> (
                {(file.size / 1024).toFixed(1)} KB)
              </>
            ) : (
              'Формат .xlsx, перший аркуш, перший рядок — заголовки'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                setFile(f)
                preview.reset()
                execute.reset()
                setMapping({})
              }}
            />
            <Button type="button" onClick={() => fileInputRef.current?.click()}>
              {file ? 'Обрати інший файл' : 'Обрати файл…'}
            </Button>
            {file && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFile(null)
                  preview.reset()
                  execute.reset()
                  setMapping({})
                }}
              >
                Скасувати
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplier">Постачальник</Label>
              <Select
                id="supplier"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">— без прив’язки —</option>
                {suppliers.data?.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="location">Локація приходу</Label>
              <Select
                id="location"
                value={location}
                onChange={(e) =>
                  setLocation(e.target.value as 'warehouse' | 'point1' | 'point2' | 'point3')
                }
              >
                <option value="warehouse">Склад</option>
                <option value="point1">Точка 1</option>
                <option value="point2">Точка 2</option>
                <option value="point3">Точка 3</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qty">Кількість за замовчуванням</Label>
              <Input
                id="qty"
                type="number"
                min={1}
                value={defaultQty}
                onChange={(e) => setDefaultQty(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="saveAs">Зберегти як шаблон мапінгу (опційно)</Label>
            <Input
              id="saveAs"
              placeholder="Напр. «Ювелір-сервіс Q2»"
              value={saveMappingAs}
              onChange={(e) => setSaveMappingAs(e.target.value)}
              disabled={!supplierId}
            />
            {!supplierId && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Щоб зберегти шаблон — виберіть постачальника
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {preview.isPending && <Alert>Читаю файл…</Alert>}
      {preview.error && <Alert variant="destructive">{preview.error.message}</Alert>}

      {preview.data && skuCheck && (
        <div className="flex flex-wrap items-center gap-4 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-neutral-600 dark:text-neutral-400">
            Зразок {skuCheck.existing.length + skuCheck.missing.length} SKU:
          </span>
          <span className="font-medium text-green-700 dark:text-green-400">
            🆕 нові {skuCheck.missing.length}
          </span>
          <span className="font-medium text-blue-700 dark:text-blue-400">
            ↻ оновиться {skuCheck.existing.length}
          </span>
          {skuCheckLoading && <span className="text-xs text-neutral-500">…перевірка</span>}
        </div>
      )}

      {preview.data && (
        <Card>
          <CardHeader>
            <CardTitle>
              2. Мапінг колонок ({mappedCount} з {ITEM_FIELDS.length})
            </CardTitle>
            <CardDescription>
              Аркуш: {preview.data.sheetName} · рядків: {preview.data.rowCount}. SKU та Вага
              обов’язкові.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {ITEM_FIELDS.map((f) => {
                const selected = mapping[f.key] ?? ''
                const isMissingRequired = f.required && !selected
                return (
                  <div key={f.key} className="flex flex-col gap-1.5">
                    <Label htmlFor={`map-${f.key}`}>
                      {f.label}
                      {f.required ? ' *' : ''}
                    </Label>
                    <Select
                      id={`map-${f.key}`}
                      value={selected}
                      onChange={(e) =>
                        setMapping((m) => ({ ...m, [f.key]: e.target.value || undefined }))
                      }
                      className={
                        isMissingRequired
                          ? 'border-red-500 dark:border-red-700'
                          : selected
                            ? 'border-green-500 dark:border-green-700'
                            : undefined
                      }
                    >
                      <option value="">— не використовувати —</option>
                      {preview.data?.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </Select>
                  </div>
                )
              })}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium text-neutral-900 dark:text-neutral-100">
                Попередній перегляд (перші {preview.data.sampleRows.length} рядків)
              </h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    {preview.data.headers.map((h) => (
                      <TableHead key={h} className="whitespace-nowrap">
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.data.sampleRows.map((row, idx) => {
                    // Build a stable key from up to 3 first cell values;
                    // fall back to idx if values are empty/duplicated.
                    const keyBase = preview.data
                      ? preview.data.headers
                          .slice(0, 3)
                          .map((h) => String(row[h] ?? ''))
                          .join('|')
                      : ''
                    const rowKey = `${keyBase}|${idx}`
                    return (
                      <TableRow key={rowKey}>
                        {preview.data?.headers.map((h) => (
                          <TableCell key={h} className="whitespace-nowrap text-xs">
                            {row[h] == null ? '—' : String(row[h])}
                          </TableCell>
                        ))}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                onClick={() => execute.mutate()}
                disabled={execute.isPending || !mapping.sku || !mapping.weight}
              >
                {execute.isPending ? 'Імпортуємо…' : `Імпортувати ${preview.data.rowCount} рядків`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {execute.error && <Alert variant="destructive">{execute.error.message}</Alert>}

      {execute.data && (
        <Card>
          <CardHeader>
            <CardTitle>3. Результат</CardTitle>
            <CardDescription>ID імпорту: {execute.data.importId}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              <Stat label="Всього" value={execute.data.rowsTotal} />
              <Stat
                label="Створено"
                value={execute.data.rowsCreated}
                tone={execute.data.rowsCreated > 0 ? 'good' : undefined}
              />
              <Stat label="Оновлено" value={execute.data.rowsUpdated} />
              <Stat
                label="Помилок"
                value={execute.data.errors.length}
                tone={execute.data.errors.length > 0 ? 'bad' : undefined}
              />
            </div>

            {execute.data.errors.length > 0 && (
              <div className="mt-4 max-h-64 overflow-auto rounded-md border border-neutral-200 p-3 text-xs dark:border-neutral-800">
                <ul className="space-y-1">
                  {execute.data.errors.slice(0, 100).map((e) => (
                    <li
                      key={`err-${e.row}-${e.message.slice(0, 30)}`}
                      className="text-red-600 dark:text-red-400"
                    >
                      Рядок {e.row}: {e.message}
                    </li>
                  ))}
                  {execute.data.errors.length > 100 && (
                    <li className="text-neutral-500">…та ще {execute.data.errors.length - 100}</li>
                  )}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Історія імпортів</CardTitle>
          <CardDescription>Останні 50 операцій</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Файл</TableHead>
                <TableHead>Постачальник</TableHead>
                <TableHead className="text-right">Створ./Оновл./Проп.</TableHead>
                <TableHead>Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pastImports.data?.imports.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-neutral-500 dark:text-neutral-400"
                  >
                    Ще не було жодного імпорту
                  </TableCell>
                </TableRow>
              )}
              {pastImports.data?.imports.map((imp) => (
                <TableRow key={imp.id}>
                  <TableCell className="whitespace-nowrap text-xs text-neutral-600 dark:text-neutral-400">
                    {new Date(imp.createdAt).toLocaleString('uk-UA')}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-xs" title={imp.filename}>
                    {imp.filename}
                  </TableCell>
                  <TableCell className="text-xs">{imp.supplier?.name ?? '—'}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    <span className="text-green-700 dark:text-green-400">{imp.rowsCreated}</span>
                    {' / '}
                    <span className="text-blue-700 dark:text-blue-400">{imp.rowsUpdated}</span>
                    {' / '}
                    <span className="text-neutral-500">{imp.rowsSkipped}</span>
                  </TableCell>
                  <TableCell className="text-xs">
                    <StatusBadge status={imp.status} />
                  </TableCell>
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
  tone,
}: {
  label: string
  value: number
  tone?: 'good' | 'bad'
}) {
  const toneClass =
    tone === 'good'
      ? 'text-green-700 dark:text-green-400'
      : tone === 'bad'
        ? 'text-red-700 dark:text-red-400'
        : 'text-neutral-900 dark:text-neutral-100'
  return (
    <div className="rounded-md border border-neutral-200 p-3 text-center dark:border-neutral-800">
      <div className={`text-2xl font-semibold ${toneClass}`}>{value}</div>
      <div className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    completed: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
    'completed-with-errors': 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    'in-progress': 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    failed: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  }
  return (
    <span
      className={`rounded-md px-2 py-0.5 text-xs font-medium ${cls[status] ?? 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'}`}
    >
      {status}
    </span>
  )
}
