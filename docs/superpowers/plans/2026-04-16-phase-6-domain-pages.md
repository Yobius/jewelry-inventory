# Phase 6 — Domain Pages, SSE, Reports, QR Scan — Implementation Plan

> **For agentic workers:** This plan is structured for sequential execution. Each task has concrete file paths, full code, and verification commands.

**Goal:** Turn the Phase 5 frontend shell into a working warehouse app — full CRUD for items, inventory adjustments, transactions (IN/OUT/MOVE), live SSE updates, PDF/XLSX reports, and a QR scanner page.

**Architecture:**
- API gains an in-memory SSE event bus (`events.ts`) and a `GET /api/events` stream. Item/inventory/transaction mutations push typed events through a shared `emit()` helper, wired at the route level after success.
- API gains `/api/reports/inventory.pdf` (via `pdfkit`) and `/api/reports/transactions.xlsx` (via `exceljs`) — auth-protected, stream-based.
- Web gains domain pages under `/dashboard/*`: `items`, `inventory`, `transactions`, `reports`, `scan`. All share the existing protected dashboard layout (sidebar gets real nav links).
- Web uses a single `useInventoryStream` hook (EventSource) that calls `queryClient.invalidateQueries` on `inventory.*`, `item.*`, `transaction.*` events.
- QR scanner uses `jsqr` on a `getUserMedia` video stream in a `requestVideoFrameCallback` loop, navigates to the matched item's detail view on hit.

**Tech Stack:** Hono SSE (`hono/streaming`), `pdfkit`, `exceljs`, `jsqr`, TanStack Query invalidation, React Hook Form, native `EventSource`.

**Scope Cut:** ADJUSTMENT transaction type already exists in schema but the master plan only calls out IN/OUT/MOVE in the UI; ADJUSTMENT stays available via the raw API (no separate UI button). Items page supports create + edit (matches Phase 4 API surface); no delete (no endpoint exists). Inventory page only shows adjust, not transfer — transfers are a transaction, not an inventory adjust.

---

## Task 6.1 — API SSE Event Bus

**Files:**
- Create: `apps/api/src/lib/events.ts`
- Create: `apps/api/src/routes/events.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Create the event bus**

Create `apps/api/src/lib/events.ts`:

```ts
export type DomainEvent =
  | { type: 'item.created'; itemId: string }
  | { type: 'item.updated'; itemId: string }
  | { type: 'inventory.adjusted'; itemId: string }
  | { type: 'transaction.created'; transactionId: string; itemId: string; kind: 'IN' | 'OUT' | 'MOVE' | 'ADJUSTMENT' }

type Subscriber = (event: DomainEvent) => void

const subscribers = new Set<Subscriber>()

export function subscribe(fn: Subscriber): () => void {
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}

export function emit(event: DomainEvent): void {
  for (const fn of subscribers) {
    try {
      fn(event)
    } catch {
      // a broken subscriber must not block siblings
    }
  }
}

/** Test helper — clears any lingering subscribers. Never call in prod code paths. */
export function __resetSubscribers(): void {
  subscribers.clear()
}
```

- [ ] **Step 2: Create the SSE route**

Create `apps/api/src/routes/events.ts`:

```ts
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { type AuthVariables, createAuthMiddleware } from '../lib/auth-middleware.js'
import { type DomainEvent, subscribe } from '../lib/events.js'

export function createEventsRoute(jwtSecret: string) {
  const route = new Hono<{ Variables: AuthVariables }>()
  route.use('*', createAuthMiddleware(jwtSecret))

  route.get('/', (c) =>
    streamSSE(c, async (stream) => {
      let id = 0
      const queue: DomainEvent[] = []
      let notify: (() => void) | null = null

      const unsubscribe = subscribe((event) => {
        queue.push(event)
        if (notify) {
          const n = notify
          notify = null
          n()
        }
      })

      // Immediate hello so the client knows the stream is open.
      id += 1
      await stream.writeSSE({ id: String(id), event: 'hello', data: '{}' })

      stream.onAbort(() => {
        unsubscribe()
      })

      try {
        while (!stream.aborted) {
          if (queue.length === 0) {
            await new Promise<void>((resolve) => {
              notify = resolve
              // Keepalive every 25s so load balancers don't kill idle streams.
              setTimeout(resolve, 25_000)
            })
            if (queue.length === 0 && !stream.aborted) {
              id += 1
              await stream.writeSSE({ id: String(id), event: 'ping', data: '{}' })
              continue
            }
          }
          const next = queue.shift()
          if (!next) continue
          id += 1
          await stream.writeSSE({
            id: String(id),
            event: next.type,
            data: JSON.stringify(next),
          })
        }
      } finally {
        unsubscribe()
      }
    }),
  )

  return route
}
```

- [ ] **Step 3: Wire the route in app.ts**

Edit `apps/api/src/app.ts` — add the import and `app.route` call:

```ts
import { createEventsRoute } from './routes/events.js'
// ...
app.route('/api/events', createEventsRoute(opts.jwtSecret))
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @jewelry/api typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/events.ts apps/api/src/routes/events.ts apps/api/src/app.ts
git commit -m "feat(api): SSE event bus + /api/events stream"
```

---

## Task 6.2 — Emit events from mutations

**Files:**
- Modify: `apps/api/src/routes/items.ts` (emit after create/update)
- Modify: `apps/api/src/routes/inventory.ts` (emit after adjust)
- Modify: `apps/api/src/routes/transactions.ts` (emit after record)

- [ ] **Step 1: items.ts — emit on create/update**

Add `import { emit } from '../lib/events.js'` at the top. After `const item = await createItem(...)` but before `return c.json(item, 201)`, insert `emit({ type: 'item.created', itemId: item.id })`. In the PATCH handler, after the non-null `item` check, insert `emit({ type: 'item.updated', itemId: item.id })`.

- [ ] **Step 2: inventory.ts — emit on adjust**

Read first, then add `import { emit } from '../lib/events.js'`. After the successful `adjustInventoryAbsolute` call, emit `{ type: 'inventory.adjusted', itemId }`.

- [ ] **Step 3: transactions.ts — emit on record**

Add `import { emit } from '../lib/events.js'`. After the successful `recordTransaction` call, emit `{ type: 'transaction.created', transactionId: result.id, itemId: parsed.data.itemId, kind: parsed.data.type }`.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @jewelry/api typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/
git commit -m "feat(api): emit domain events from item/inventory/transaction routes"
```

---

## Task 6.3 — SSE integration test

**Files:**
- Create: `apps/api/test/events.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { prisma } from '@jewelry/db'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { __resetSubscribers, emit, subscribe } from '../src/lib/events.js'
import { cleanupUser, makeTestApp, registerAndLogin, uniqueSku } from './helpers/app.js'

const createdUserIds: string[] = []

afterEach(async () => {
  __resetSubscribers()
  while (createdUserIds.length > 0) {
    const id = createdUserIds.pop()
    if (id) await cleanupUser(id)
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('events bus', () => {
  it('subscribe receives events until unsubscribed', () => {
    const received: string[] = []
    const unsubscribe = subscribe((e) => received.push(e.type))
    emit({ type: 'item.created', itemId: 'abc' })
    emit({ type: 'inventory.adjusted', itemId: 'abc' })
    unsubscribe()
    emit({ type: 'item.updated', itemId: 'abc' })
    expect(received).toEqual(['item.created', 'inventory.adjusted'])
  })

  it('broken subscriber does not block siblings', () => {
    const received: string[] = []
    subscribe(() => {
      throw new Error('boom')
    })
    subscribe((e) => received.push(e.type))
    emit({ type: 'item.created', itemId: 'x' })
    expect(received).toEqual(['item.created'])
  })
})

describe('POST /api/items emits item.created', () => {
  it('creates event when an item is created', async () => {
    const app = makeTestApp()
    const user = await registerAndLogin(app)
    createdUserIds.push(user.id)
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` }

    const received: string[] = []
    subscribe((e) => received.push(e.type))

    const res = await app.request('/api/items', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sku: uniqueSku(),
        name: 'Event test',
        specs: { tags: [] },
        material: 'SILVER',
        weight: '1.00',
        pricing: { unitPrice: '1.00', perGram: '1.00' },
        identification: { qrCode: 'qr-evt' },
      }),
    })
    expect(res.status).toBe(201)
    expect(received).toContain('item.created')
  })
})
```

- [ ] **Step 2: Run the test**

Run: `pnpm --filter @jewelry/api test -- events`
Expected: 3 passed.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/events.test.ts
git commit -m "test(api): event bus unit + integration coverage"
```

---

## Task 6.4 — API reports: PDF + XLSX

**Files:**
- Modify: `apps/api/package.json` (add `pdfkit`, `exceljs`, `@types/pdfkit`)
- Create: `apps/api/src/services/reports.ts`
- Create: `apps/api/src/routes/reports.ts`
- Modify: `apps/api/src/app.ts` (mount route)

- [ ] **Step 1: Install deps**

```bash
pnpm --filter @jewelry/api add pdfkit exceljs
pnpm --filter @jewelry/api add -D @types/pdfkit
```

- [ ] **Step 2: Report service**

Create `apps/api/src/services/reports.ts`:

```ts
import { prisma } from '@jewelry/db'
import { getQuantities } from './inventory.js'

export type InventoryReportRow = {
  sku: string
  name: string
  material: string
  weight: string
  warehouse: number
  point1: number
  point2: number
  point3: number
  total: number
}

export async function loadInventoryReport(): Promise<InventoryReportRow[]> {
  const items = await prisma.item.findMany({
    include: { inventory: true },
    orderBy: { createdAt: 'desc' },
  })
  return items.map((item) => {
    const q = getQuantities(item.inventory?.quantities)
    return {
      sku: item.sku,
      name: item.name,
      material: item.material,
      weight: item.weight.toString(),
      warehouse: q.warehouse,
      point1: q.point1,
      point2: q.point2,
      point3: q.point3,
      total: q.warehouse + q.point1 + q.point2 + q.point3,
    }
  })
}

export type TransactionReportRow = {
  createdAt: Date
  type: string
  sku: string
  itemName: string
  quantity: number
  from: string | null
  to: string | null
  reason: string | null
}

export async function loadTransactionsReport(limit = 500): Promise<TransactionReportRow[]> {
  const rows = await prisma.transaction.findMany({
    include: { item: true },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 2000),
  })
  return rows.map((tx) => {
    const movement =
      tx.movement && typeof tx.movement === 'object' && !Array.isArray(tx.movement)
        ? (tx.movement as Record<string, unknown>)
        : {}
    return {
      createdAt: tx.createdAt,
      type: tx.type,
      sku: tx.item.sku,
      itemName: tx.item.name,
      quantity: tx.quantity,
      from: typeof movement.from === 'string' ? movement.from : null,
      to: typeof movement.to === 'string' ? movement.to : null,
      reason: tx.reason,
    }
  })
}
```

- [ ] **Step 3: Reports route**

Create `apps/api/src/routes/reports.ts`:

```ts
import ExcelJS from 'exceljs'
import { Hono } from 'hono'
import PDFDocument from 'pdfkit'
import { type AuthVariables, createAuthMiddleware } from '../lib/auth-middleware.js'
import { loadInventoryReport, loadTransactionsReport } from '../services/reports.js'

export function createReportsRoute(jwtSecret: string) {
  const route = new Hono<{ Variables: AuthVariables }>()
  route.use('*', createAuthMiddleware(jwtSecret))

  route.get('/inventory.pdf', async (c) => {
    const rows = await loadInventoryReport()
    const pdf = await renderInventoryPdf(rows)
    return new Response(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="inventory.pdf"',
        'Content-Length': String(pdf.byteLength),
      },
    })
  })

  route.get('/transactions.xlsx', async (c) => {
    const rows = await loadTransactionsReport()
    const xlsx = await renderTransactionsXlsx(rows)
    return new Response(xlsx, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="transactions.xlsx"',
        'Content-Length': String(xlsx.byteLength),
      },
    })
  })

  return route
}

async function renderInventoryPdf(rows: Awaited<ReturnType<typeof loadInventoryReport>>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36 })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))))
    doc.on('error', reject)

    doc.fontSize(16).text('Inventory Report', { align: 'center' })
    doc.moveDown(0.5)
    doc.fontSize(9).fillColor('#666').text(new Date().toISOString(), { align: 'center' })
    doc.moveDown(1)
    doc.fillColor('#000')

    const headers = ['SKU', 'Name', 'Material', 'WH', 'P1', 'P2', 'P3', 'Total']
    const widths = [70, 140, 60, 40, 40, 40, 40, 50]
    let x = doc.page.margins.left
    const startY = doc.y
    doc.fontSize(9).font('Helvetica-Bold')
    headers.forEach((h, i) => {
      const width = widths[i] ?? 50
      doc.text(h, x, startY, { width, align: 'left' })
      x += width
    })
    doc.moveDown(0.5)
    doc.font('Helvetica')

    for (const row of rows) {
      const y = doc.y
      const cells = [
        row.sku,
        row.name,
        row.material,
        String(row.warehouse),
        String(row.point1),
        String(row.point2),
        String(row.point3),
        String(row.total),
      ]
      let cx = doc.page.margins.left
      cells.forEach((cell, i) => {
        const width = widths[i] ?? 50
        doc.text(cell, cx, y, { width, align: 'left' })
        cx += width
      })
      doc.moveDown(0.4)
      if (doc.y > doc.page.height - doc.page.margins.bottom - 20) {
        doc.addPage()
      }
    }

    doc.end()
  })
}

async function renderTransactionsXlsx(
  rows: Awaited<ReturnType<typeof loadTransactionsReport>>,
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  const sheet = wb.addWorksheet('Transactions')
  sheet.columns = [
    { header: 'Date', key: 'createdAt', width: 22 },
    { header: 'Type', key: 'type', width: 10 },
    { header: 'SKU', key: 'sku', width: 18 },
    { header: 'Item', key: 'itemName', width: 30 },
    { header: 'Qty', key: 'quantity', width: 8 },
    { header: 'From', key: 'from', width: 12 },
    { header: 'To', key: 'to', width: 12 },
    { header: 'Reason', key: 'reason', width: 30 },
  ]
  sheet.getRow(1).font = { bold: true }
  for (const row of rows) {
    sheet.addRow({
      createdAt: row.createdAt.toISOString(),
      type: row.type,
      sku: row.sku,
      itemName: row.itemName,
      quantity: row.quantity,
      from: row.from,
      to: row.to,
      reason: row.reason,
    })
  }
  const buf = await wb.xlsx.writeBuffer()
  return new Uint8Array(buf as ArrayBuffer)
}
```

- [ ] **Step 4: Mount the route**

Edit `apps/api/src/app.ts`:

```ts
import { createReportsRoute } from './routes/reports.js'
// ...
app.route('/api/reports', createReportsRoute(opts.jwtSecret))
```

- [ ] **Step 5: Integration test**

Create `apps/api/test/reports.test.ts`:

```ts
import { prisma } from '@jewelry/db'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { cleanupUser, makeTestApp, registerAndLogin, uniqueSku } from './helpers/app.js'

const createdUserIds: string[] = []

afterEach(async () => {
  while (createdUserIds.length > 0) {
    const id = createdUserIds.pop()
    if (id) await cleanupUser(id)
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('GET /api/reports/*', () => {
  it('returns a PDF for inventory', async () => {
    const app = makeTestApp()
    const user = await registerAndLogin(app)
    createdUserIds.push(user.id)
    const headers = { Authorization: `Bearer ${user.token}` }

    const res = await app.request('/api/reports/inventory.pdf', { headers })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    const buf = new Uint8Array(await res.arrayBuffer())
    // PDF magic bytes: %PDF
    expect(buf[0]).toBe(0x25)
    expect(buf[1]).toBe(0x50)
    expect(buf[2]).toBe(0x44)
    expect(buf[3]).toBe(0x46)
  })

  it('returns an XLSX for transactions', async () => {
    const app = makeTestApp()
    const user = await registerAndLogin(app)
    createdUserIds.push(user.id)
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.token}`,
    }

    // Create an item + a transaction so the sheet has at least one row
    const item = await app.request('/api/items', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sku: uniqueSku(),
        name: 'Report test',
        specs: { tags: [] },
        material: 'GOLD',
        weight: '10.00',
        pricing: { unitPrice: '100.00', perGram: '10.00' },
        identification: { qrCode: 'qr-rpt' },
        initialQuantities: { warehouse: 10, point1: 0, point2: 0, point3: 0 },
      }),
    })
    const itemBody = (await item.json()) as { id: string }

    await app.request('/api/transactions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        itemId: itemBody.id,
        type: 'OUT',
        quantity: 2,
        from: 'warehouse',
        reason: 'report test',
      }),
    })

    const res = await app.request('/api/reports/transactions.xlsx', {
      headers: { Authorization: `Bearer ${user.token}` },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    const buf = new Uint8Array(await res.arrayBuffer())
    // XLSX is a ZIP: starts with PK\x03\x04
    expect(buf[0]).toBe(0x50)
    expect(buf[1]).toBe(0x4b)
    expect(buf[2]).toBe(0x03)
    expect(buf[3]).toBe(0x04)
  })
})
```

- [ ] **Step 6: Run test**

Run: `pnpm --filter @jewelry/api test -- reports`
Expected: 2 passed.

- [ ] **Step 7: Commit**

```bash
git add apps/api/package.json apps/api/src/services/reports.ts apps/api/src/routes/reports.ts apps/api/src/app.ts apps/api/test/reports.test.ts pnpm-lock.yaml
git commit -m "feat(api): inventory.pdf + transactions.xlsx report endpoints"
```

---

## Task 6.5 — Web dashboard navigation

**Files:**
- Modify: `apps/web/src/app/dashboard/layout.tsx` (real nav links)

- [ ] **Step 1: Replace placeholder nav**

Replace the `<nav>` block in the existing layout with real `Link`s to `/dashboard`, `/dashboard/items`, `/dashboard/inventory`, `/dashboard/transactions`, `/dashboard/reports`, `/dashboard/scan`. Use `usePathname()` to highlight the active link.

```tsx
'use client'

import { useAuthStore } from '@/lib/auth-store'
import { Button } from '@jewelry/ui'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { type ReactNode, useEffect } from 'react'

const nav = [
  { href: '/dashboard', label: 'Обзор' },
  { href: '/dashboard/items', label: 'Товары' },
  { href: '/dashboard/inventory', label: 'Склад' },
  { href: '/dashboard/transactions', label: 'Транзакции' },
  { href: '/dashboard/reports', label: 'Отчёты' },
  { href: '/dashboard/scan', label: 'QR-сканер' },
]

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const clear = useAuthStore((s) => s.clear)

  useEffect(() => {
    if (!token) router.replace('/login')
  }, [router, token])

  if (!token) return null

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r border-neutral-200 bg-white p-6">
        <h1 className="mb-8 text-lg font-semibold text-neutral-900">Jewelry Inventory</h1>
        <nav className="flex flex-col gap-1 text-sm">
          {nav.map((link) => {
            const active = pathname === link.href
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  active
                    ? 'rounded-md bg-neutral-100 px-3 py-2 font-medium text-neutral-900'
                    : 'rounded-md px-3 py-2 text-neutral-600 hover:bg-neutral-50'
                }
              >
                {link.label}
              </Link>
            )
          })}
        </nav>
        <div className="mt-8 border-t border-neutral-200 pt-6">
          <p className="text-sm font-medium text-neutral-900">{user?.name}</p>
          <p className="text-xs text-neutral-500">{user?.email}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            onClick={() => {
              clear()
              router.replace('/login')
            }}
          >
            Выйти
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Commit (with task 6.6)** — this layout change commits alongside the items page below.

---

## Task 6.6 — Web types + shared helpers

**Files:**
- Create: `apps/web/src/lib/types.ts`
- Create: `apps/web/src/lib/format.ts`

- [ ] **Step 1: Types matching API responses**

Create `apps/web/src/lib/types.ts`:

```ts
export type LocationKey = 'warehouse' | 'point1' | 'point2' | 'point3'

export type Quantities = Record<LocationKey, number>

export type Item = {
  id: string
  sku: string
  name: string
  specs: { tags?: string[]; width?: number; height?: number; depth?: number }
  material: 'GOLD' | 'SILVER' | 'PLATINUM' | 'OTHER'
  carat: number | null
  weight: string
  pricing: { unitPrice: string; perGram: string }
  identification: { qrCode: string; barcode?: string }
  inventory?: { quantities: Partial<Quantities> } | null
  createdAt: string
  updatedAt: string
}

export type ItemsListResponse = { items: Item[]; total: number }

export type Transaction = {
  id: string
  itemId: string
  type: 'IN' | 'OUT' | 'MOVE' | 'ADJUSTMENT'
  quantity: number
  movement: { from?: LocationKey; to?: LocationKey }
  reason: string | null
  createdAt: string
}

export type TransactionsListResponse = { transactions: Transaction[] }
```

- [ ] **Step 2: Format helpers**

Create `apps/web/src/lib/format.ts`:

```ts
import type { Quantities } from './types'

export const LOCATION_LABELS: Record<keyof Quantities, string> = {
  warehouse: 'Склад',
  point1: 'Точка 1',
  point2: 'Точка 2',
  point3: 'Точка 3',
}

export function totalQuantity(q: Partial<Quantities> | undefined | null): number {
  if (!q) return 0
  return (q.warehouse ?? 0) + (q.point1 ?? 0) + (q.point2 ?? 0) + (q.point3 ?? 0)
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
```

---

## Task 6.7 — Web items page (list + create dialog)

**Files:**
- Create: `apps/web/src/app/dashboard/items/page.tsx`
- Create: `apps/web/src/app/dashboard/items/item-form-dialog.tsx`
- Create: `packages/ui/src/dialog.tsx` (lightweight modal — no Radix yet)
- Create: `packages/ui/src/table.tsx` (styled table wrappers)
- Create: `packages/ui/src/select.tsx` (styled native select)
- Modify: `packages/ui/src/index.ts` (re-export)

- [ ] **Step 1: Dialog primitive**

Create `packages/ui/src/dialog.tsx`:

```tsx
'use client'

import { type ReactNode, useEffect } from 'react'
import { cn } from './cn'

export type DialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  className?: string
}

export function Dialog({ open, onOpenChange, children, className }: DialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onOpenChange])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => onOpenChange(false)}
        onKeyDown={() => {}}
        role="button"
        tabIndex={-1}
        aria-label="Close dialog"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative z-10 w-full max-w-md rounded-lg border border-neutral-200 bg-white p-6 shadow-lg',
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}

export function DialogHeader({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-col gap-1">{children}</div>
}

export function DialogTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-lg font-semibold text-neutral-900">{children}</h2>
}

export function DialogDescription({ children }: { children: ReactNode }) {
  return <p className="text-sm text-neutral-500">{children}</p>
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex justify-end gap-2">{children}</div>
}
```

- [ ] **Step 2: Table primitive**

Create `packages/ui/src/table.tsx`:

```tsx
import { type HTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes, forwardRef } from 'react'
import { cn } from './cn'

export const Table = forwardRef<HTMLTableElement, HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="w-full overflow-auto rounded-lg border border-neutral-200">
      <table ref={ref} className={cn('w-full text-left text-sm', className)} {...props} />
    </div>
  ),
)
Table.displayName = 'Table'

export const TableHeader = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead
      ref={ref}
      className={cn('bg-neutral-50 text-xs uppercase text-neutral-500', className)}
      {...props}
    />
  ),
)
TableHeader.displayName = 'TableHeader'

export const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn('divide-y divide-neutral-200 bg-white', className)} {...props} />
  ),
)
TableBody.displayName = 'TableBody'

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={cn('hover:bg-neutral-50', className)} {...props} />
  ),
)
TableRow.displayName = 'TableRow'

export const TableHead = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th ref={ref} className={cn('px-4 py-3 font-medium', className)} {...props} />
  ),
)
TableHead.displayName = 'TableHead'

export const TableCell = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn('px-4 py-3 text-neutral-900', className)} {...props} />
  ),
)
TableCell.displayName = 'TableCell'
```

- [ ] **Step 3: Select primitive**

Create `packages/ui/src/select.tsx`:

```tsx
import { type SelectHTMLAttributes, forwardRef } from 'react'
import { cn } from './cn'

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
)
Select.displayName = 'Select'
```

- [ ] **Step 4: Re-export from `packages/ui/src/index.ts`**

Append:

```ts
export { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './dialog'
export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './table'
export { Select, type SelectProps } from './select'
```

- [ ] **Step 5: Item form dialog**

Create `apps/web/src/app/dashboard/items/item-form-dialog.tsx`:

```tsx
'use client'

import { type ApiError, apiRequest } from '@/lib/api-client'
import type { Item } from '@/lib/types'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Alert,
  Button,
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
} from '@jewelry/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

const decimalString = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Число с точностью до 0.01')

const itemFormSchema = z.object({
  sku: z.string().min(1, 'SKU обязательно'),
  name: z.string().min(1, 'Название обязательно'),
  material: z.enum(['GOLD', 'SILVER', 'PLATINUM', 'OTHER']),
  weight: decimalString,
  unitPrice: decimalString,
  perGram: decimalString,
  qrCode: z.string().min(1, 'QR-код обязателен'),
  tags: z.string().optional(),
  warehouse: z.coerce.number().int().min(0).default(0),
  point1: z.coerce.number().int().min(0).default(0),
  point2: z.coerce.number().int().min(0).default(0),
  point3: z.coerce.number().int().min(0).default(0),
})
type ItemForm = z.infer<typeof itemFormSchema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialItem?: Item | null
}

export function ItemFormDialog({ open, onOpenChange, initialItem }: Props) {
  const queryClient = useQueryClient()
  const isEdit = Boolean(initialItem)

  const form = useForm<ItemForm>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: {
      sku: '',
      name: '',
      material: 'SILVER',
      weight: '0.00',
      unitPrice: '0.00',
      perGram: '0.00',
      qrCode: '',
      tags: '',
      warehouse: 0,
      point1: 0,
      point2: 0,
      point3: 0,
    },
  })

  useEffect(() => {
    if (!open) return
    if (initialItem) {
      form.reset({
        sku: initialItem.sku,
        name: initialItem.name,
        material: initialItem.material,
        weight: initialItem.weight,
        unitPrice: initialItem.pricing.unitPrice,
        perGram: initialItem.pricing.perGram,
        qrCode: initialItem.identification.qrCode,
        tags: initialItem.specs.tags?.join(', ') ?? '',
        warehouse: initialItem.inventory?.quantities.warehouse ?? 0,
        point1: initialItem.inventory?.quantities.point1 ?? 0,
        point2: initialItem.inventory?.quantities.point2 ?? 0,
        point3: initialItem.inventory?.quantities.point3 ?? 0,
      })
    } else {
      form.reset()
    }
  }, [open, initialItem, form])

  const mutation = useMutation<unknown, ApiError, ItemForm>({
    mutationFn: async (values) => {
      const body = {
        sku: values.sku,
        name: values.name,
        material: values.material,
        weight: values.weight,
        specs: {
          tags: values.tags
            ? values.tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)
            : [],
        },
        pricing: { unitPrice: values.unitPrice, perGram: values.perGram },
        identification: { qrCode: values.qrCode },
        ...(isEdit
          ? {}
          : {
              initialQuantities: {
                warehouse: values.warehouse,
                point1: values.point1,
                point2: values.point2,
                point3: values.point3,
              },
            }),
      }
      if (isEdit && initialItem) {
        return apiRequest(`/api/items/${initialItem.id}`, { method: 'PATCH', body })
      }
      return apiRequest('/api/items', { method: 'POST', body })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      onOpenChange(false)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{isEdit ? 'Редактировать товар' : 'Новый товар'}</DialogTitle>
        <DialogDescription>
          {isEdit ? 'Обновите поля товара' : 'Заполните карточку нового товара'}
        </DialogDescription>
      </DialogHeader>

      <form
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        className="flex flex-col gap-4"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sku">SKU</Label>
            <Input id="sku" {...form.register('sku')} disabled={isEdit} />
            {form.formState.errors.sku && (
              <p className="text-xs text-red-600">{form.formState.errors.sku.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Название</Label>
            <Input id="name" {...form.register('name')} />
            {form.formState.errors.name && (
              <p className="text-xs text-red-600">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="material">Материал</Label>
            <Select id="material" {...form.register('material')}>
              <option value="GOLD">GOLD</option>
              <option value="SILVER">SILVER</option>
              <option value="PLATINUM">PLATINUM</option>
              <option value="OTHER">OTHER</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="weight">Вес (г)</Label>
            <Input id="weight" {...form.register('weight')} />
            {form.formState.errors.weight && (
              <p className="text-xs text-red-600">{form.formState.errors.weight.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unitPrice">Цена</Label>
            <Input id="unitPrice" {...form.register('unitPrice')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="perGram">Цена за грамм</Label>
            <Input id="perGram" {...form.register('perGram')} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="qrCode">QR-код</Label>
            <Input id="qrCode" {...form.register('qrCode')} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="tags">Теги (через запятую)</Label>
            <Input id="tags" {...form.register('tags')} />
          </div>
          {!isEdit && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="warehouse">Склад</Label>
                <Input id="warehouse" type="number" {...form.register('warehouse')} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="point1">Точка 1</Label>
                <Input id="point1" type="number" {...form.register('point1')} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="point2">Точка 2</Label>
                <Input id="point2" type="number" {...form.register('point2')} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="point3">Точка 3</Label>
                <Input id="point3" type="number" {...form.register('point3')} />
              </div>
            </>
          )}
        </div>

        {mutation.error && <Alert variant="destructive">{mutation.error.message}</Alert>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
```

- [ ] **Step 6: Items page**

Create `apps/web/src/app/dashboard/items/page.tsx`:

```tsx
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
                <TableCell>{item.material}</TableCell>
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

      <ItemFormDialog open={creating} onOpenChange={setCreating} />
      <ItemFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        initialItem={editing}
      />
    </div>
  )
}
```

- [ ] **Step 7: Typecheck + lint**

Run: `pnpm -r typecheck && pnpm lint`
Expected: both green.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/ apps/web/src/app/dashboard/ apps/web/src/lib/types.ts apps/web/src/lib/format.ts
git commit -m "feat(web): dashboard nav + items page with create/edit dialog"
```

---

## Task 6.8 — Web inventory page

**Files:**
- Create: `apps/web/src/app/dashboard/inventory/page.tsx`
- Create: `apps/web/src/app/dashboard/inventory/adjust-dialog.tsx`

- [ ] **Step 1: Adjust dialog**

Create `apps/web/src/app/dashboard/inventory/adjust-dialog.tsx`:

```tsx
'use client'

import { type ApiError, apiRequest } from '@/lib/api-client'
import { LOCATION_LABELS } from '@/lib/format'
import type { Item } from '@/lib/types'
import {
  Alert,
  Button,
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@jewelry/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

type Props = {
  item: Item | null
  onOpenChange: (open: boolean) => void
}

export function AdjustDialog({ item, onOpenChange }: Props) {
  const queryClient = useQueryClient()
  const [values, setValues] = useState({ warehouse: 0, point1: 0, point2: 0, point3: 0 })

  useEffect(() => {
    if (!item) return
    const q = item.inventory?.quantities ?? {}
    setValues({
      warehouse: q.warehouse ?? 0,
      point1: q.point1 ?? 0,
      point2: q.point2 ?? 0,
      point3: q.point3 ?? 0,
    })
  }, [item])

  const mutation = useMutation<unknown, ApiError, typeof values>({
    mutationFn: (v) =>
      apiRequest(`/api/inventory/${item?.id}`, {
        method: 'PATCH',
        body: v,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      onOpenChange(false)
    },
  })

  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Коррекция остатков</DialogTitle>
        <DialogDescription>{item?.name}</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        {(Object.keys(values) as (keyof typeof values)[]).map((key) => (
          <div key={key} className="flex flex-col gap-1.5">
            <Label htmlFor={`adj-${key}`}>{LOCATION_LABELS[key]}</Label>
            <Input
              id={`adj-${key}`}
              type="number"
              value={values[key]}
              onChange={(e) => setValues({ ...values, [key]: Number(e.target.value) || 0 })}
            />
          </div>
        ))}

        {mutation.error && <Alert variant="destructive">{mutation.error.message}</Alert>}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Отмена
        </Button>
        <Button onClick={() => mutation.mutate(values)} disabled={mutation.isPending}>
          {mutation.isPending ? 'Сохраняем…' : 'Применить'}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
```

- [ ] **Step 2: Inventory page**

Create `apps/web/src/app/dashboard/inventory/page.tsx`:

```tsx
'use client'

import { apiRequest } from '@/lib/api-client'
import { LOCATION_LABELS, totalQuantity } from '@/lib/format'
import type { Item, ItemsListResponse } from '@/lib/types'
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@jewelry/ui'
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
            {(Object.keys(LOCATION_LABELS) as (keyof typeof LOCATION_LABELS)[]).map((key) => (
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

      <AdjustDialog item={adjusting} onOpenChange={(open) => !open && setAdjusting(null)} />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/inventory/
git commit -m "feat(web): inventory page with absolute-quantity adjust dialog"
```

---

## Task 6.9 — Web transactions page

**Files:**
- Create: `apps/web/src/app/dashboard/transactions/page.tsx`
- Create: `apps/web/src/app/dashboard/transactions/transaction-dialog.tsx`

- [ ] **Step 1: Transaction dialog**

Create `apps/web/src/app/dashboard/transactions/transaction-dialog.tsx`:

```tsx
'use client'

import { type ApiError, apiRequest } from '@/lib/api-client'
import { LOCATION_LABELS } from '@/lib/format'
import type { Item, ItemsListResponse } from '@/lib/types'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Alert,
  Button,
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
} from '@jewelry/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

const schema = z
  .object({
    itemId: z.string().min(1, 'Выберите товар'),
    type: z.enum(['IN', 'OUT', 'MOVE']),
    quantity: z.coerce.number().int().positive('Количество > 0'),
    from: z.enum(['warehouse', 'point1', 'point2', 'point3']).optional(),
    to: z.enum(['warehouse', 'point1', 'point2', 'point3']).optional(),
    reason: z.string().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'IN' && !v.to) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'IN требует "куда"' })
    }
    if (v.type === 'OUT' && !v.from) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['from'], message: 'OUT требует "откуда"' })
    }
    if (v.type === 'MOVE') {
      if (!v.from || !v.to) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['from'],
          message: 'MOVE требует обе локации',
        })
      } else if (v.from === v.to) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['to'],
          message: 'Локации должны различаться',
        })
      }
    }
  })
type TxForm = z.infer<typeof schema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TransactionDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient()

  const itemsQuery = useQuery<ItemsListResponse>({
    queryKey: ['items', { take: 100 }],
    queryFn: () => apiRequest<ItemsListResponse>('/api/items?take=100'),
    enabled: open,
  })

  const form = useForm<TxForm>({
    resolver: zodResolver(schema),
    defaultValues: { itemId: '', type: 'IN', quantity: 1, reason: '' },
  })

  useEffect(() => {
    if (!open) form.reset()
  }, [open, form])

  const type = form.watch('type')

  const mutation = useMutation<unknown, ApiError, TxForm>({
    mutationFn: (values) => apiRequest('/api/transactions', { method: 'POST', body: values }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      onOpenChange(false)
    },
  })

  const items = itemsQuery.data?.items ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Новая транзакция</DialogTitle>
        <DialogDescription>Поступление, отгрузка или перемещение</DialogDescription>
      </DialogHeader>

      <form
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="itemId">Товар</Label>
          <Select id="itemId" {...form.register('itemId')}>
            <option value="">— выберите —</option>
            {items.map((item: Item) => (
              <option key={item.id} value={item.id}>
                {item.sku} — {item.name}
              </option>
            ))}
          </Select>
          {form.formState.errors.itemId && (
            <p className="text-xs text-red-600">{form.formState.errors.itemId.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type">Тип</Label>
            <Select id="type" {...form.register('type')}>
              <option value="IN">IN — приход</option>
              <option value="OUT">OUT — расход</option>
              <option value="MOVE">MOVE — перемещение</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quantity">Количество</Label>
            <Input id="quantity" type="number" {...form.register('quantity')} />
            {form.formState.errors.quantity && (
              <p className="text-xs text-red-600">{form.formState.errors.quantity.message}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {(type === 'OUT' || type === 'MOVE') && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="from">Откуда</Label>
              <Select id="from" {...form.register('from')}>
                <option value="">—</option>
                {(Object.keys(LOCATION_LABELS) as (keyof typeof LOCATION_LABELS)[]).map((k) => (
                  <option key={k} value={k}>
                    {LOCATION_LABELS[k]}
                  </option>
                ))}
              </Select>
              {form.formState.errors.from && (
                <p className="text-xs text-red-600">{form.formState.errors.from.message}</p>
              )}
            </div>
          )}
          {(type === 'IN' || type === 'MOVE') && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="to">Куда</Label>
              <Select id="to" {...form.register('to')}>
                <option value="">—</option>
                {(Object.keys(LOCATION_LABELS) as (keyof typeof LOCATION_LABELS)[]).map((k) => (
                  <option key={k} value={k}>
                    {LOCATION_LABELS[k]}
                  </option>
                ))}
              </Select>
              {form.formState.errors.to && (
                <p className="text-xs text-red-600">{form.formState.errors.to.message}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reason">Причина (опционально)</Label>
          <Input id="reason" {...form.register('reason')} />
        </div>

        {mutation.error && <Alert variant="destructive">{mutation.error.message}</Alert>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Сохраняем…' : 'Создать'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
```

- [ ] **Step 2: Transactions page**

Create `apps/web/src/app/dashboard/transactions/page.tsx`:

```tsx
'use client'

import { apiRequest } from '@/lib/api-client'
import { formatDate, LOCATION_LABELS } from '@/lib/format'
import type { LocationKey, Transaction, TransactionsListResponse } from '@/lib/types'
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@jewelry/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { TransactionDialog } from './transaction-dialog'

const TYPE_COLORS: Record<Transaction['type'], string> = {
  IN: 'bg-green-50 text-green-700',
  OUT: 'bg-red-50 text-red-700',
  MOVE: 'bg-blue-50 text-blue-700',
  ADJUSTMENT: 'bg-amber-50 text-amber-700',
}

function formatMovement(tx: Transaction): string {
  const from = tx.movement.from ? LOCATION_LABELS[tx.movement.from as LocationKey] : null
  const to = tx.movement.to ? LOCATION_LABELS[tx.movement.to as LocationKey] : null
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
          <h2 className="text-2xl font-semibold text-neutral-900">Транзакции</h2>
          <p className="text-sm text-neutral-500">Приходы, отгрузки, перемещения</p>
        </div>
        <Button onClick={() => setCreating(true)}>+ Новая транзакция</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Дата</TableHead>
            <TableHead>Тип</TableHead>
            <TableHead>Кол-во</TableHead>
            <TableHead>Движение</TableHead>
            <TableHead>Причина</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.isLoading && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-neutral-500">
                Загрузка…
              </TableCell>
            </TableRow>
          )}
          {query.data?.transactions.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-neutral-500">
                Пока нет транзакций
              </TableCell>
            </TableRow>
          )}
          {query.data?.transactions.map((tx) => (
            <TableRow key={tx.id}>
              <TableCell className="text-xs text-neutral-600">{formatDate(tx.createdAt)}</TableCell>
              <TableCell>
                <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[tx.type]}`}>
                  {tx.type}
                </span>
              </TableCell>
              <TableCell className="font-semibold">{tx.quantity}</TableCell>
              <TableCell className="text-xs">{formatMovement(tx)}</TableCell>
              <TableCell className="text-xs text-neutral-600">{tx.reason ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <TransactionDialog open={creating} onOpenChange={setCreating} />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/transactions/
git commit -m "feat(web): transactions page with IN/OUT/MOVE create dialog"
```

---

## Task 6.10 — Web SSE hook + query invalidation

**Files:**
- Modify: `apps/web/src/lib/api-client.ts` (expose baseUrl constant)
- Create: `apps/web/src/lib/use-inventory-stream.ts`
- Modify: `apps/web/src/app/dashboard/layout.tsx` (mount the hook)

**Design note:** The native `EventSource` does NOT support custom headers. To authenticate the SSE stream we pass the JWT as a `?token=<jwt>` query parameter. This requires extending the API auth middleware to accept token via query string on SSE routes. Alternatively, because our API and web run on the same origin in prod, we can use a cookie — but we currently store the token in Zustand, not a cookie. Path chosen: **accept token as query param in `/api/events` only** by inspecting `c.req.query('token')` when the `Authorization` header is absent. This keeps other routes unchanged.

- [ ] **Step 1: Extend the API auth middleware to accept `?token=` for SSE**

Edit `apps/api/src/lib/auth-middleware.ts` — read the file first. In the middleware, if `authHeader` is missing, check `c.req.query('token')` and use that as the token string. Otherwise proceed as before. This is a minimal, opt-in change and keeps existing behavior identical when callers send the header.

```ts
// In the middleware body, before the existing 401:
const headerAuth = c.req.header('Authorization')
const queryToken = c.req.query('token')
const raw = headerAuth?.startsWith('Bearer ')
  ? headerAuth.slice('Bearer '.length)
  : queryToken
if (!raw) return c.json({ error: 'Unauthorized' }, 401)
// ... then verifyJwt(raw) as before
```

Verify the existing test suite still passes: `pnpm --filter @jewelry/api test`.

- [ ] **Step 2: Expose baseUrl**

Edit `apps/web/src/lib/api-client.ts`, export the existing `baseUrl` constant so other modules can build URLs:

```ts
export const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
// then use apiBaseUrl in apiRequest
```

- [ ] **Step 3: SSE hook**

Create `apps/web/src/lib/use-inventory-stream.ts`:

```ts
'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { apiBaseUrl } from './api-client'
import { useAuthStore } from './auth-store'

const EVENT_TYPES = ['item.created', 'item.updated', 'inventory.adjusted', 'transaction.created']

export function useInventoryStream(): void {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!token) return
    const url = `${apiBaseUrl}/api/events?token=${encodeURIComponent(token)}`
    const es = new EventSource(url)

    const handleItem = () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
    }
    const handleTx = () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
    }

    es.addEventListener('item.created', handleItem)
    es.addEventListener('item.updated', handleItem)
    es.addEventListener('inventory.adjusted', handleItem)
    es.addEventListener('transaction.created', handleTx)
    // swallow errors — browser will auto-reconnect
    es.onerror = () => {}

    return () => {
      for (const type of EVENT_TYPES) {
        es.removeEventListener(type, handleItem as EventListener)
        es.removeEventListener(type, handleTx as EventListener)
      }
      es.close()
    }
  }, [token, queryClient])
}
```

- [ ] **Step 4: Mount the hook in the dashboard layout**

Add `useInventoryStream()` call inside `DashboardLayout`, after the existing hooks.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/auth-middleware.ts apps/web/src/lib/api-client.ts apps/web/src/lib/use-inventory-stream.ts apps/web/src/app/dashboard/layout.tsx
git commit -m "feat(web): SSE-driven query invalidation via /api/events"
```

---

## Task 6.11 — Web reports page

**Files:**
- Create: `apps/web/src/app/dashboard/reports/page.tsx`

- [ ] **Step 1: Reports page**

```tsx
'use client'

import { apiBaseUrl } from '@/lib/api-client'
import { useAuthStore } from '@/lib/auth-store'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@jewelry/ui'
import { useState } from 'react'

async function downloadReport(path: string, token: string, filename: string) {
  const res = await fetch(`${apiBaseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Не удалось загрузить (${res.status})`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function ReportsPage() {
  const token = useAuthStore((s) => s.token)
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handle = async (kind: 'pdf' | 'xlsx') => {
    if (!token) return
    setBusy(kind)
    setError(null)
    try {
      if (kind === 'pdf') {
        await downloadReport('/api/reports/inventory.pdf', token, 'inventory.pdf')
      } else {
        await downloadReport('/api/reports/transactions.xlsx', token, 'transactions.xlsx')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-neutral-900">Отчёты</h2>
        <p className="text-sm text-neutral-500">Экспорт данных в PDF и XLSX</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Остатки — PDF</CardTitle>
            <CardDescription>
              Полный список товаров с количеством по каждой локации
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => handle('pdf')} disabled={busy !== null}>
              {busy === 'pdf' ? 'Генерируем…' : 'Скачать PDF'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Транзакции — XLSX</CardTitle>
            <CardDescription>
              Выгрузка последних 500 операций в Excel-формате
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => handle('xlsx')} disabled={busy !== null}>
              {busy === 'xlsx' ? 'Генерируем…' : 'Скачать XLSX'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/dashboard/reports/
git commit -m "feat(web): reports page with PDF + XLSX download buttons"
```

---

## Task 6.12 — Web QR scanner page

**Files:**
- Modify: `apps/web/package.json` (add `jsqr`)
- Create: `apps/web/src/app/dashboard/scan/page.tsx`

- [ ] **Step 1: Install jsqr**

```bash
pnpm --filter @jewelry/web add jsqr
pnpm --filter @jewelry/web add -D @types/jsqr
```

(If `@types/jsqr` does not exist on npm, skip it — jsqr ships its own types.)

- [ ] **Step 2: Scan page**

```tsx
'use client'

import { apiRequest } from '@/lib/api-client'
import type { Item, ItemsListResponse } from '@/lib/types'
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@jewelry/ui'
import jsQR from 'jsqr'
import { useEffect, useRef, useState } from 'react'

type ScanStatus = 'idle' | 'running' | 'error'

export default function ScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<ScanStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [match, setMatch] = useState<Item | null>(null)
  const [lastCode, setLastCode] = useState<string | null>(null)
  const rafRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const start = async () => {
    setError(null)
    setMatch(null)
    setStatus('running')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        scan()
      }
    } catch (e) {
      setStatus('error')
      setError(e instanceof Error ? e.message : 'Не удалось получить доступ к камере')
    }
  }

  const stop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setStatus('idle')
  }

  const scan = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scan)
      return
    }
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      rafRef.current = requestAnimationFrame(scan)
      return
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(imageData.data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' })
    if (code && code.data && code.data !== lastCode) {
      setLastCode(code.data)
      handleMatch(code.data)
    }
    rafRef.current = requestAnimationFrame(scan)
  }

  const handleMatch = async (qr: string) => {
    // Use search endpoint to find item with matching qrCode
    try {
      const res = await apiRequest<ItemsListResponse>(
        `/api/items?search=${encodeURIComponent(qr)}&take=5`,
      )
      const found = res.items.find(
        (item) => item.identification.qrCode === qr || item.sku === qr,
      )
      if (found) {
        setMatch(found)
        stop()
      }
    } catch {
      // silent — keep scanning
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-neutral-900">QR-сканер</h2>
        <p className="text-sm text-neutral-500">Наведите камеру на QR-код товара</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Камера</CardTitle>
          <CardDescription>
            {status === 'running'
              ? 'Сканирование активно'
              : status === 'error'
                ? 'Ошибка'
                : 'Нажмите "Начать" чтобы активировать камеру'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="aspect-video w-full max-w-2xl overflow-hidden rounded-lg border border-neutral-200 bg-black">
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted>
              <track kind="captions" />
            </video>
          </div>
          <canvas ref={canvasRef} className="hidden" />
          <div className="flex gap-2">
            {status !== 'running' ? (
              <Button onClick={start}>Начать</Button>
            ) : (
              <Button variant="outline" onClick={stop}>
                Остановить
              </Button>
            )}
          </div>
          {error && <Alert variant="destructive">{error}</Alert>}
          {lastCode && !match && (
            <p className="text-sm text-neutral-600">
              Последний код: <span className="font-mono">{lastCode}</span> — товар не найден
            </p>
          )}
        </CardContent>
      </Card>

      {match && (
        <Card>
          <CardHeader>
            <CardTitle>Найден товар</CardTitle>
            <CardDescription>Сканирование остановлено</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt className="font-medium text-neutral-700">SKU</dt>
              <dd className="font-mono">{match.sku}</dd>
              <dt className="font-medium text-neutral-700">Название</dt>
              <dd>{match.name}</dd>
              <dt className="font-medium text-neutral-700">Материал</dt>
              <dd>{match.material}</dd>
              <dt className="font-medium text-neutral-700">Вес</dt>
              <dd>{match.weight} г</dd>
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json apps/web/src/app/dashboard/scan/ pnpm-lock.yaml
git commit -m "feat(web): QR scanner page with jsqr + getUserMedia"
```

---

## Task 6.13 — Verification

- [ ] **Step 1: Full test suite**

Run: `pnpm --filter @jewelry/api test`
Expected: all tests green (31 existing + events + reports).

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm -r typecheck && pnpm lint`
Expected: both green.

- [ ] **Step 3: Dev smoke test**

Start both servers in background, curl routes, inspect logs. Phase 5 workflow applies.
- `GET /health` → 200
- `GET /dashboard/items` → 200 (Next compiles page)
- `GET /dashboard/inventory` → 200
- `GET /dashboard/transactions` → 200
- `GET /dashboard/reports` → 200
- `GET /dashboard/scan` → 200
- `GET /api/reports/inventory.pdf` with token → 200 application/pdf
- `GET /api/reports/transactions.xlsx` with token → 200 xlsx

- [ ] **Step 4: Kill bg processes, nothing to commit**

All commits already landed.
