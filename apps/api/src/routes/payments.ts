import { Prisma, prisma } from '@jewelry/db'
import { Hono } from 'hono'
import { z } from 'zod'
import type { Env } from '../env.js'
import { writeAudit } from '../lib/audit.js'
import { type AuthVariables, createAuthMiddleware } from '../lib/auth-middleware.js'
import { emit } from '../lib/events.js'
import {
  type LiqPayCallbackPayload,
  createInvoice,
  isTerminalStatus,
  verifyCallback,
} from '../services/liqpay.js'

const lineSchema = z.object({
  itemId: z.string().min(1),
  sku: z.string().min(1),
  qty: z.coerce.number().int().min(1),
  unitPrice: z.string(),
})

const createPaymentSchema = z.object({
  method: z.enum(['CASH', 'CARD', 'TERMINAL']),
  amount: z.coerce.number().min(0.01),
  discountPct: z.coerce.number().int().min(0).max(100).default(0),
  items: z.array(lineSchema).min(1).max(500),
  description: z.string().max(400).optional(),
})

export function createPaymentsRoute(env: Env, jwtSecret: string) {
  const route = new Hono<{ Variables: AuthVariables }>()

  // LiqPay callback is unauthenticated (comes from LiqPay servers).
  // It verifies the signature instead.
  route.post('/liqpay/callback', async (c) => {
    if (!env.LIQPAY_PRIVATE_KEY) {
      return c.json({ error: 'LiqPay not configured' }, 503)
    }
    const form = await c.req.formData().catch(() => null)
    const data = form?.get('data')
    const signature = form?.get('signature')
    if (typeof data !== 'string' || typeof signature !== 'string') {
      return c.json({ error: 'Bad callback: missing data/signature' }, 400)
    }
    const decoded = verifyCallback(data, signature, env.LIQPAY_PRIVATE_KEY)
    if (!decoded) {
      return c.json({ error: 'Invalid signature' }, 400)
    }
    await handleCallback(decoded, { rawData: data, rawSignature: signature })
    // LiqPay wants 200 OK on receipt
    return c.body(null, 200)
  })

  // All remaining endpoints are authenticated
  route.use('*', createAuthMiddleware(jwtSecret))

  // Create a payment record + optionally return signed LiqPay data for the UI.
  route.post('/', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = createPaymentSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    }
    const userId = c.get('userId')
    const receiptId = `POS-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

    const payment = await prisma.payment.create({
      data: {
        receiptId,
        method: parsed.data.method,
        status: parsed.data.method === 'TERMINAL' ? 'PENDING' : 'SUCCESS',
        amount: new Prisma.Decimal(parsed.data.amount.toFixed(2)),
        currency: 'UAH',
        discountPct: parsed.data.discountPct,
        items: parsed.data.items as unknown as Prisma.InputJsonValue,
        userId,
        paidAt: parsed.data.method === 'TERMINAL' ? null : new Date(),
      },
    })

    // For cash/card we consider the payment done at creation time — the checkout
    // transactions (OUT) will be created by the POS after it gets success here.
    if (parsed.data.method !== 'TERMINAL') {
      return c.json({ payment, liqpay: null })
    }

    if (!env.LIQPAY_PUBLIC_KEY || !env.LIQPAY_PRIVATE_KEY) {
      // No LiqPay configured — fail gracefully so the POS UI knows
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', providerData: { reason: 'LIQPAY_NOT_CONFIGURED' } },
      })
      return c.json(
        {
          error:
            'LiqPay (ПриватБанк) ще не налаштовано. Додай LIQPAY_PUBLIC_KEY і LIQPAY_PRIVATE_KEY у .env на сервері і зроби redeploy.',
        },
        503,
      )
    }

    const signed = createInvoice(
      {
        receiptId,
        amount: parsed.data.amount,
        description:
          parsed.data.description ?? `POS чек ${receiptId} (${parsed.data.items.length} позицій)`,
      },
      {
        publicKey: env.LIQPAY_PUBLIC_KEY,
        privateKey: env.LIQPAY_PRIVATE_KEY,
        publicOrigin: env.PUBLIC_ORIGIN,
      },
    )

    await writeAudit({
      userId,
      action: 'payment.create',
      entityId: payment.id,
      metadata: {
        method: parsed.data.method,
        amount: parsed.data.amount,
        receiptId,
      } as Prisma.InputJsonValue,
    })

    return c.json({ payment, liqpay: signed })
  })

  // Poll payment status (used by POS while LiqPay QR is on screen)
  route.get('/:receiptId', async (c) => {
    const receiptId = c.req.param('receiptId')
    const p = await prisma.payment.findUnique({ where: { receiptId } })
    if (!p) return c.json({ error: 'Not found' }, 404)
    return c.json(p)
  })

  // Cancel a PENDING terminal payment (cashier aborted)
  route.post('/:receiptId/cancel', async (c) => {
    const receiptId = c.req.param('receiptId')
    const p = await prisma.payment.findUnique({ where: { receiptId } })
    if (!p) return c.json({ error: 'Not found' }, 404)
    if (p.status !== 'PENDING') {
      return c.json({ error: `Cannot cancel — status is ${p.status}` }, 409)
    }
    const updated = await prisma.payment.update({
      where: { id: p.id },
      data: { status: 'CANCELLED' },
    })
    await writeAudit({
      userId: c.get('userId'),
      action: 'payment.cancel',
      entityId: p.id,
      metadata: { receiptId } as Prisma.InputJsonValue,
    })
    emit({ type: 'item.updated', itemId: 'payment' }) // re-use channel for UI invalidation
    return c.json(updated)
  })

  return route
}

// -----------------------------------------------------------------------------
// LiqPay → our DB
// -----------------------------------------------------------------------------

async function handleCallback(
  decoded: LiqPayCallbackPayload,
  raw: { rawData: string; rawSignature: string },
): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { receiptId: String(decoded.order_id) },
  })
  if (!payment) {
    console.error('LiqPay callback for unknown order:', decoded.order_id)
    return
  }
  const terminal = isTerminalStatus(decoded.status)
  const nextStatus =
    terminal === 'success' ? 'SUCCESS' : terminal === 'failed' ? 'FAILED' : 'PENDING'

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: nextStatus,
      providerRef: String(decoded.payment_id ?? decoded.transaction_id ?? ''),
      providerData: {
        callback: decoded as unknown,
        raw,
      } as unknown as Prisma.InputJsonValue,
      paidAt: terminal === 'success' ? new Date() : payment.paidAt,
    },
  })

  await writeAudit({
    userId: payment.userId,
    action: `payment.callback.${decoded.status}`,
    entityId: payment.id,
    metadata: {
      order_id: decoded.order_id,
      amount: decoded.amount,
      paytype: decoded.paytype,
      err_code: decoded.err_code,
      err_description: decoded.err_description,
    } as Prisma.InputJsonValue,
  })
}
