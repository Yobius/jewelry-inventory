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

function itemBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    sku: uniqueSku(),
    name: 'Silver chain',
    specs: { tags: ['chain', 'silver'] },
    material: 'SILVER',
    carat: 925,
    weight: '12.50',
    pricing: { unitPrice: '2000.00', perGram: '150.00' },
    identification: { qrCode: 'qr-tx', barcode: 'br-tx' },
    initialQuantities: { warehouse: 5, point1: 2, point2: 1, point3: 0 },
    ...overrides,
  }
}

async function auth() {
  const app = makeTestApp()
  const user = await registerAndLogin(app)
  createdUserIds.push(user.id)
  return {
    app,
    token: user.token,
    userId: user.id,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
  }
}

async function createItem(
  app: ReturnType<typeof makeTestApp>,
  headers: Record<string, string>,
  overrides: Partial<Record<string, unknown>> = {},
) {
  const res = await app.request('/api/items', {
    method: 'POST',
    headers,
    body: JSON.stringify(itemBody(overrides)),
  })
  if (res.status !== 201) {
    throw new Error(`createItem failed (${res.status}): ${await res.text()}`)
  }
  return (await res.json()) as { id: string }
}

async function readQuantities(itemId: string) {
  const inv = await prisma.inventory.findUnique({ where: { itemId } })
  return inv?.quantities as Record<string, number>
}

describe('POST /api/transactions', () => {
  it('IN adds quantity to target location', async () => {
    const { app, headers } = await auth()
    const { id } = await createItem(app, headers)

    const res = await app.request('/api/transactions', {
      method: 'POST',
      headers,
      body: JSON.stringify({ itemId: id, type: 'IN', quantity: 3, to: 'warehouse' }),
    })
    expect(res.status).toBe(201)

    const q = await readQuantities(id)
    expect(q.warehouse).toBe(8)
    expect(q.point1).toBe(2)
  })

  it('OUT subtracts quantity from source location', async () => {
    const { app, headers } = await auth()
    const { id } = await createItem(app, headers)

    const res = await app.request('/api/transactions', {
      method: 'POST',
      headers,
      body: JSON.stringify({ itemId: id, type: 'OUT', quantity: 2, from: 'warehouse' }),
    })
    expect(res.status).toBe(201)

    const q = await readQuantities(id)
    expect(q.warehouse).toBe(3)
  })

  it('MOVE transfers quantity atomically from from→to', async () => {
    const { app, headers } = await auth()
    const { id } = await createItem(app, headers)

    const res = await app.request('/api/transactions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        itemId: id,
        type: 'MOVE',
        quantity: 2,
        from: 'warehouse',
        to: 'point1',
      }),
    })
    expect(res.status).toBe(201)

    const q = await readQuantities(id)
    expect(q.warehouse).toBe(3)
    expect(q.point1).toBe(4)
  })

  it('OUT with insufficient stock returns 409 and does not mutate inventory', async () => {
    const { app, headers } = await auth()
    const { id } = await createItem(app, headers)
    const before = await readQuantities(id)

    const res = await app.request('/api/transactions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        itemId: id,
        type: 'OUT',
        quantity: 999,
        from: 'warehouse',
      }),
    })
    expect(res.status).toBe(409)

    const after = await readQuantities(id)
    expect(after).toEqual(before)
  })

  it('records MOVE validation failure for same from/to with 400', async () => {
    const { app, headers } = await auth()
    const { id } = await createItem(app, headers)

    const res = await app.request('/api/transactions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        itemId: id,
        type: 'MOVE',
        quantity: 1,
        from: 'warehouse',
        to: 'warehouse',
      }),
    })
    expect(res.status).toBe(400)
  })

  it('unknown itemId returns 404', async () => {
    const { app, headers } = await auth()
    const res = await app.request('/api/transactions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        itemId: 'c0000000000000000000000000',
        type: 'IN',
        quantity: 1,
        to: 'warehouse',
      }),
    })
    expect(res.status).toBe(404)
  })

  it('writes a Transaction row and an audit entry', async () => {
    const { app, headers, userId } = await auth()
    const { id } = await createItem(app, headers)

    const res = await app.request('/api/transactions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        itemId: id,
        type: 'MOVE',
        quantity: 1,
        from: 'warehouse',
        to: 'point2',
        reason: 'relocation',
      }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { id: string; type: string }
    expect(body.type).toBe('MOVE')

    const txRow = await prisma.transaction.findUnique({ where: { id: body.id } })
    expect(txRow).not.toBeNull()
    expect(txRow?.userId).toBe(userId)
    expect(txRow?.itemId).toBe(id)

    const audit = await prisma.auditLog.findMany({
      where: { entityId: body.id, action: 'transaction.move' },
    })
    expect(audit.length).toBeGreaterThanOrEqual(1)
  })

  it('GET /api/transactions lists transactions', async () => {
    const { app, headers } = await auth()
    const { id } = await createItem(app, headers)

    await app.request('/api/transactions', {
      method: 'POST',
      headers,
      body: JSON.stringify({ itemId: id, type: 'IN', quantity: 1, to: 'point3' }),
    })

    const listRes = await app.request('/api/transactions?limit=10', { headers })
    expect(listRes.status).toBe(200)
    const listBody = (await listRes.json()) as { transactions: { itemId: string }[] }
    expect(listBody.transactions.some((t) => t.itemId === id)).toBe(true)
  })
})
