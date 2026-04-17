'use client'

import { type ApiError, apiRequest } from '@/lib/api-client'
import { LOCATION_KEYS, LOCATION_LABELS } from '@/lib/format'
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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { TerminalPaymentDialog } from './terminal-payment-dialog'

type Item = {
  id: string
  sku: string
  name: string
  material: string
  carat: number | null
  weight: string
  pricing: { unitPrice: string; perGram: string }
  identification: { qrCode?: string; barcode?: string }
  inventory?: { quantities: Record<string, number> } | null
}
type ItemsList = { items: Item[]; total: number }

type ReceiptLine = {
  item: Item
  qty: number
  /** user-adjustable override of unit price for this sale */
  unitPrice: string
}

type LocKey = 'warehouse' | 'point1' | 'point2' | 'point3'

export default function PosPage() {
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [code, setCode] = useState('')
  const [lines, setLines] = useState<ReceiptLine[]>([])
  const [location, setLocation] = useState<LocKey>('point1')
  const [status, setStatus] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  /** Discount as percent (0-100). Applied to the grand total. */
  const [discountPct, setDiscountPct] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'terminal'>('cash')
  const [terminalOpen, setTerminalOpen] = useState(false)

  // Autofocus scanner field on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Global keyboard shortcuts: Esc = clear code / chosen, Alt+C = focus scanner.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCode('')
        setLastError(null)
        inputRef.current?.focus()
      } else if (e.altKey && (e.key === 'c' || e.key === 'C' || e.key === 'с' || e.key === 'С')) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const lookup = useMutation<Item, Error, string>({
    mutationFn: async (q) => {
      const list = await apiRequest<ItemsList>(`/api/items?take=5&search=${encodeURIComponent(q)}`)
      // Prefer exact match by sku / barcode / qrCode
      const exact = list.items.find(
        (i) =>
          i.sku === q ||
          (i.identification.barcode && i.identification.barcode === q) ||
          i.identification.qrCode === q,
      )
      const hit = exact ?? list.items[0]
      if (!hit) throw new Error(`Товар не знайдено: "${q}"`)
      return hit
    },
    onSuccess: (item) => {
      setLastError(null)
      setLines((prev) => {
        const idx = prev.findIndex((l) => l.item.id === item.id)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = { ...next[idx]!, qty: next[idx]!.qty + 1 }
          return next
        }
        return [...prev, { item, qty: 1, unitPrice: item.pricing?.unitPrice ?? '0' }]
      })
      setStatus(`✓ додано: ${item.sku} — ${item.name}`)
      setTimeout(() => setStatus(null), 2500)
    },
    onError: (e) => setLastError(e.message),
  })

  const checkout = useMutation<
    { created: number },
    ApiError,
    { lines: ReceiptLine[]; location: LocKey; discountPct: number }
  >({
    mutationFn: async (payload) => {
      const receiptId = `POS-${Date.now()}`
      const discountNote = payload.discountPct > 0 ? ` · знижка ${payload.discountPct}%` : ''
      let created = 0
      for (const line of payload.lines) {
        await apiRequest('/api/transactions', {
          method: 'POST',
          body: {
            itemId: line.item.id,
            type: 'OUT',
            quantity: line.qty,
            from: payload.location,
            reason: `${receiptId}${discountNote} · ${line.item.sku} × ${line.qty} @ ${line.unitPrice}`,
          },
        })
        created++
      }
      return { created }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      qc.invalidateQueries({ queryKey: ['sales'] })
      setLines([])
      setDiscountPct(0)
      setStatus('✓ Чек проведено')
      setTimeout(() => setStatus(null), 3000)
      inputRef.current?.focus()
    },
  })

  const handleSubmit = useCallback(() => {
    const q = code.trim()
    if (!q) return
    lookup.mutate(q)
    setCode('')
  }, [code, lookup])

  const total = lines.reduce((sum, l) => sum + Number(l.unitPrice || 0) * l.qty, 0)
  const totalUnits = lines.reduce((sum, l) => sum + l.qty, 0)

  function updateLine(idx: number, partial: Partial<ReceiptLine>) {
    setLines((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx]!, ...partial }
      return next
    })
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx))
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">Каса · POS</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Наведи сканер на штрих-код або QR, натисни Enter. Товар відразу додасться в чек.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Сканер</CardTitle>
          <CardDescription>
            Введи Code 128 / QR / SKU · поле буде автоматично у фокусі
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSubmit()
            }}
            className="flex gap-2"
          >
            <Input
              ref={inputRef}
              placeholder="Скануй або друкуй…"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              className="flex-1 text-lg font-mono"
            />
            <Button type="submit" disabled={lookup.isPending}>
              {lookup.isPending ? '…' : 'Додати'}
            </Button>
          </form>
          {status && (
            <Alert>
              <span className="text-green-700 dark:text-green-400">{status}</span>
            </Alert>
          )}
          {lastError && <Alert variant="destructive">{lastError}</Alert>}

          <div className="flex items-center gap-3">
            <Label htmlFor="loc">Локація відвантаження:</Label>
            <Select
              id="loc"
              value={location}
              onChange={(e) => setLocation(e.target.value as LocKey)}
              className="w-auto"
            >
              {LOCATION_KEYS.map((k) => (
                <option key={k} value={k}>
                  {LOCATION_LABELS[k]}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Чек ({lines.length} позицій, {totalUnits} шт.)
          </CardTitle>
          <CardDescription>Кількість та ціну можна змінити перед проведенням</CardDescription>
        </CardHeader>
        <CardContent>
          {lines.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Пусто. Відскануй товар щоб додати.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU / Назва</TableHead>
                  <TableHead className="text-right">Вага, г</TableHead>
                  <TableHead className="w-28 text-center">К-сть</TableHead>
                  <TableHead className="w-32 text-right">Ціна, ₴</TableHead>
                  <TableHead className="text-right">Сума</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, idx) => {
                  const stock = l.item.inventory?.quantities?.[location as string] ?? 0
                  const lowStock = l.qty > stock
                  return (
                    <TableRow key={l.item.id}>
                      <TableCell>
                        <div className="font-mono text-xs text-neutral-500">{l.item.sku}</div>
                        <div>{l.item.name}</div>
                        {lowStock && (
                          <div className="text-xs text-red-600 dark:text-red-400">
                            На {LOCATION_LABELS[location]} лишилось {stock}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs">{l.item.weight}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateLine(idx, { qty: Math.max(1, l.qty - 1) })}
                          >
                            −
                          </Button>
                          <span className="w-8 font-mono text-sm">{l.qty}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateLine(idx, { qty: l.qty + 1 })}
                          >
                            +
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={l.unitPrice}
                          onChange={(e) => updateLine(idx, { unitPrice: e.target.value })}
                          className="text-right font-mono"
                        />
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {(Number(l.unitPrice || 0) * l.qty).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeLine(idx)}
                          aria-label="Прибрати"
                        >
                          ✕
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between py-6">
          <div>
            <div className="text-sm text-neutral-500 dark:text-neutral-400">До сплати</div>
            <div className="text-4xl font-semibold text-neutral-900 dark:text-neutral-50">
              {total.toFixed(2)} ₴
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setLines([])}
              disabled={lines.length === 0 || checkout.isPending}
            >
              Очистити
            </Button>
            <Button
              onClick={() => checkout.mutate({ lines, location, discountPct })}
              disabled={lines.length === 0 || checkout.isPending}
              className="text-lg"
            >
              {checkout.isPending ? 'Проводимо…' : 'Провести чек (OUT)'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {checkout.error && <Alert variant="destructive">{checkout.error.message}</Alert>}
    </div>
  )
}
