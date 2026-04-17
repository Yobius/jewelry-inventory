import { prisma } from '@jewelry/db'
import { Hono } from 'hono'
import { z } from 'zod'
import { type AuthVariables, createAuthMiddleware } from '../lib/auth-middleware.js'
import {
  createPrintJobs,
  fetchLabelItems,
  markPrintJobsPrinted,
  renderLabelsPdf,
} from '../services/labels.js'

const labelRequestSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.string().min(1),
        copies: z.coerce.number().int().min(1).max(200).default(1),
      }),
    )
    .min(1)
    .max(500),
  format: z.enum(['25x35', '25x40', '40x60', '50x30']).default('25x35'),
  /** If true, enqueue a PrintJob for each requested item too. */
  enqueue: z.coerce.boolean().default(false),
})

export function createLabelsRoute(jwtSecret: string) {
  const route = new Hono<{ Variables: AuthVariables }>()
  route.use('*', createAuthMiddleware(jwtSecret))

  // Generate PDF with labels
  route.post('/pdf', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = labelRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    }
    const items = await fetchLabelItems(parsed.data.items)
    if (items.length === 0) {
      return c.json({ error: 'Жоден з переданих itemId не знайдено в БД' }, 404)
    }

    if (parsed.data.enqueue) {
      const batchId = `batch-${Date.now()}`
      await createPrintJobs(
        items.map((i) => i.id),
        c.get('userId'),
        1,
        batchId,
      )
    }

    const pdf = await renderLabelsPdf(items, parsed.data.format)
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="labels-${parsed.data.format}-${Date.now()}.pdf"`,
      },
    })
  })

  // List queued print jobs
  route.get('/print-jobs', async (c) => {
    const status = new URL(c.req.url).searchParams.get('status') ?? 'QUEUED'
    const jobs = await prisma.printJob.findMany({
      where: { status: status as 'QUEUED' | 'PRINTED' | 'CANCELLED' },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        item: {
          select: { id: true, sku: true, name: true, material: true, carat: true, weight: true },
        },
      },
    })
    return c.json({ jobs })
  })

  // Mark jobs as printed
  route.post('/print-jobs/mark-printed', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = z.object({ ids: z.array(z.string()).min(1).max(500) }).safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    }
    const count = await markPrintJobsPrinted(parsed.data.ids)
    return c.json({ markedPrinted: count })
  })

  // Enqueue print jobs from item IDs (no PDF)
  route.post('/print-jobs', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = z
      .object({
        itemIds: z.array(z.string()).min(1).max(500),
        copies: z.coerce.number().int().min(1).max(50).default(1),
      })
      .safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    }
    await createPrintJobs(
      parsed.data.itemIds,
      c.get('userId'),
      parsed.data.copies,
      `batch-${Date.now()}`,
    )
    return c.json({ enqueued: parsed.data.itemIds.length })
  })

  return route
}
