'use client'

import { apiRequest } from '@/lib/api-client'
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
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

type Supplier = { id: string; name: string }
type Manufacturer = { id: string; name: string }

type Filter = {
  material?: 'GOLD' | 'SILVER' | 'PLATINUM' | 'OTHER'
  manufacturerId?: string
  supplierId?: string
  weightMin?: number
  weightMax?: number
  caratMin?: number
  caratMax?: number
  tag?: string
}

type Formula =
  | { kind: 'fixed'; unitPrice: string }
  | { kind: 'perGramPlusWork'; perGram: string; work: string }
  | { kind: 'percent'; percent: number }

type BulkResult = {
  matched: number
  updated: number
  sample: {
    id: string
    sku: string
    name: string
    oldUnitPrice: string
    newUnitPrice: string
  }[]
  dryRun: boolean
  refused?: 'too_many_rows'
  error?: string
}

export default function PricingPage() {
  const [filter, setFilter] = useState<Filter>({})
  const [formulaKind, setFormulaKind] = useState<'fixed' | 'perGramPlusWork' | 'percent'>(
    'perGramPlusWork',
  )
  const [fixedPrice, setFixedPrice] = useState('0.00')
  const [perGram, setPerGram] = useState('0.00')
  const [work, setWork] = useState('0.00')
  const [percent, setPercent] = useState(10)
  const [maxRows, setMaxRows] = useState(2000)

  const suppliers = useQuery<{ items: Supplier[]; total: number }>({
    queryKey: ['suppliers', 'all'],
    queryFn: () => apiRequest('/api/suppliers?take=200'),
  })
  const manufacturers = useQuery<{ items: Manufacturer[]; total: number }>({
    queryKey: ['manufacturers', 'all'],
    queryFn: () => apiRequest('/api/manufacturers?take=200'),
  })

  function buildFormula(): Formula {
    if (formulaKind === 'fixed') return { kind: 'fixed', unitPrice: fixedPrice }
    if (formulaKind === 'percent') return { kind: 'percent', percent }
    return { kind: 'perGramPlusWork', perGram, work }
  }

  const dryRun = useMutation<BulkResult, Error, void>({
    mutationFn: () =>
      apiRequest<BulkResult>('/api/items/bulk-price', {
        method: 'POST',
        body: { filter: cleanFilter(filter), formula: buildFormula(), maxRows, dryRun: true },
      }),
  })

  const apply = useMutation<BulkResult, Error, void>({
    mutationFn: () =>
      apiRequest<BulkResult>('/api/items/bulk-price', {
        method: 'POST',
        body: { filter: cleanFilter(filter), formula: buildFormula(), maxRows, dryRun: false },
      }),
  })

  const result = apply.data ?? dryRun.data
  const canApply = dryRun.data && !dryRun.data.refused && dryRun.data.matched > 0

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          Масова переоцінка
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Відбери товари фільтром, обери формулу, переглянь preview і застосуй.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Фільтр</CardTitle>
          <CardDescription>Всі поля опційні. Порожнє — не фільтрує.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            <LabeledSelect
              label="Метал"
              value={filter.material ?? ''}
              onChange={(v) =>
                setFilter((f) => ({
                  ...f,
                  material: (v as Filter['material']) || undefined,
                }))
              }
            >
              <option value="">— будь-який —</option>
              <option value="GOLD">GOLD</option>
              <option value="SILVER">SILVER</option>
              <option value="PLATINUM">PLATINUM</option>
              <option value="OTHER">OTHER</option>
            </LabeledSelect>

            <LabeledSelect
              label="Виробник"
              value={filter.manufacturerId ?? ''}
              onChange={(v) =>
                setFilter((f) => ({ ...f, manufacturerId: v || undefined }))
              }
            >
              <option value="">— будь-який —</option>
              {manufacturers.data?.items.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </LabeledSelect>

            <LabeledSelect
              label="Постачальник"
              value={filter.supplierId ?? ''}
              onChange={(v) => setFilter((f) => ({ ...f, supplierId: v || undefined }))}
            >
              <option value="">— будь-який —</option>
              {suppliers.data?.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </LabeledSelect>

            <LabeledInput
              label="Категорія (tag)"
              placeholder="Каблучка / Сережки / …"
              value={filter.tag ?? ''}
              onChange={(v) => setFilter((f) => ({ ...f, tag: v || undefined }))}
            />

            <LabeledInput
              label="Вага ≥, г"
              type="number"
              step="0.01"
              value={filter.weightMin?.toString() ?? ''}
              onChange={(v) =>
                setFilter((f) => ({ ...f, weightMin: v ? Number(v) : undefined }))
              }
            />
            <LabeledInput
              label="Вага ≤, г"
              type="number"
              step="0.01"
              value={filter.weightMax?.toString() ?? ''}
              onChange={(v) =>
                setFilter((f) => ({ ...f, weightMax: v ? Number(v) : undefined }))
              }
            />
            <LabeledInput
              label="Проба ≥"
              type="number"
              value={filter.caratMin?.toString() ?? ''}
              onChange={(v) =>
                setFilter((f) => ({ ...f, caratMin: v ? Number(v) : undefined }))
              }
            />
            <LabeledInput
              label="Проба ≤"
              type="number"
              value={filter.caratMax?.toString() ?? ''}
              onChange={(v) =>
                setFilter((f) => ({ ...f, caratMax: v ? Number(v) : undefined }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Формула ціни</CardTitle>
          <CardDescription>Що підставити замість старої ціни кожного товару.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex gap-6 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="formula"
                checked={formulaKind === 'perGramPlusWork'}
                onChange={() => setFormulaKind('perGramPlusWork')}
              />
              за грам × вага + робота
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="formula"
                checked={formulaKind === 'fixed'}
                onChange={() => setFormulaKind('fixed')}
              />
              фіксована
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="formula"
                checked={formulaKind === 'percent'}
                onChange={() => setFormulaKind('percent')}
              />
              % до поточної
            </label>
          </div>

          {formulaKind === 'perGramPlusWork' && (
            <div className="grid grid-cols-2 gap-4 md:max-w-md">
              <LabeledInput
                label="Ціна за грам, ₴"
                value={perGram}
                onChange={setPerGram}
                type="number"
                step="0.01"
              />
              <LabeledInput
                label="Робота (дод.), ₴"
                value={work}
                onChange={setWork}
                type="number"
                step="0.01"
              />
            </div>
          )}
          {formulaKind === 'fixed' && (
            <div className="md:max-w-xs">
              <LabeledInput
                label="Ціна одиниці, ₴"
                value={fixedPrice}
                onChange={setFixedPrice}
                type="number"
                step="0.01"
              />
            </div>
          )}
          {formulaKind === 'percent' && (
            <div className="md:max-w-xs">
              <LabeledInput
                label="Зміна, % (+10 = +10%, -5 = -5%)"
                value={percent.toString()}
                onChange={(v) => setPercent(Number(v) || 0)}
                type="number"
              />
            </div>
          )}

          <div className="md:max-w-xs">
            <LabeledInput
              label="Ліміт (maxRows) — відмовить якщо більше"
              type="number"
              value={maxRows.toString()}
              onChange={(v) => setMaxRows(Math.max(1, Number(v) || 2000))}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={() => dryRun.mutate()} disabled={dryRun.isPending}>
          {dryRun.isPending ? 'Рахуємо…' : 'Попередній перегляд'}
        </Button>
        <Button
          variant="outline"
          onClick={() => apply.mutate()}
          disabled={!canApply || apply.isPending}
        >
          {apply.isPending ? 'Застосовуємо…' : 'Застосувати зміни'}
        </Button>
      </div>

      {dryRun.error && <Alert variant="destructive">{dryRun.error.message}</Alert>}
      {apply.error && <Alert variant="destructive">{apply.error.message}</Alert>}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>
              {result.dryRun ? 'Preview' : 'Результат'} — зачеплено {result.matched}{' '}
              {result.matched === 1 ? 'товар' : 'товарів'}
              {!result.dryRun && `, оновлено ${result.updated}`}
            </CardTitle>
            <CardDescription>
              {result.refused === 'too_many_rows'
                ? `⚠️ Відмовлено: більше ніж ліміт ${maxRows}. Уточни фільтр або підвищ ліміт.`
                : `Нижче — перші ${result.sample.length} позицій з результату`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Назва</TableHead>
                  <TableHead className="text-right">Було, ₴</TableHead>
                  <TableHead className="text-right">Стане, ₴</TableHead>
                  <TableHead className="text-right">Δ, ₴</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.sample.map((r) => {
                  const delta = Number(r.newUnitPrice) - Number(r.oldUnitPrice)
                  const deltaClass =
                    delta > 0
                      ? 'text-green-700 dark:text-green-400'
                      : delta < 0
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-neutral-500'
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="text-right font-mono">{r.oldUnitPrice}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {r.newUnitPrice}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${deltaClass}`}>
                        {delta > 0 ? '+' : ''}
                        {delta.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function cleanFilter(f: Filter): Filter {
  const out: Filter = {}
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || v === '') continue
    ;(out as Record<string, unknown>)[k] = v
  }
  return out
}

function LabeledInput({
  label,
  value,
  onChange,
  type = 'text',
  step,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  step?: string
  placeholder?: string
}) {
  const id = `in-${label.replace(/\s+/g, '-')}`
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function LabeledSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  const id = `sel-${label.replace(/\s+/g, '-')}`
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </Select>
    </div>
  )
}
