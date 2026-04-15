import { prisma } from '@jewelry/db'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { __resetSubscribers, emit, subscribe } from '../src/lib/events.js'
import { cleanupUser, makeTestApp, registerAndLogin, uniqueSku } from './helpers/app.js'

const createdUserIds: string[] = []

beforeEach(() => {
  __resetSubscribers()
})

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

describe('routes emit events', () => {
  it('POST /api/items emits item.created', async () => {
    const app = makeTestApp()
    const user = await registerAndLogin(app)
    createdUserIds.push(user.id)
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.token}`,
    }

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

  it('PATCH /api/inventory/:id emits inventory.adjusted', async () => {
    const app = makeTestApp()
    const user = await registerAndLogin(app)
    createdUserIds.push(user.id)
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.token}`,
    }

    const itemRes = await app.request('/api/items', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sku: uniqueSku(),
        name: 'Adjust test',
        specs: { tags: [] },
        material: 'GOLD',
        weight: '5.00',
        pricing: { unitPrice: '50.00', perGram: '5.00' },
        identification: { qrCode: 'qr-adj' },
      }),
    })
    const item = (await itemRes.json()) as { id: string }

    const received: string[] = []
    subscribe((e) => received.push(e.type))

    const res = await app.request(`/api/inventory/${item.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ warehouse: 42 }),
    })
    expect(res.status).toBe(200)
    expect(received).toEqual(['inventory.adjusted'])
  })

  it('POST /api/transactions emits transaction.created', async () => {
    const app = makeTestApp()
    const user = await registerAndLogin(app)
    createdUserIds.push(user.id)
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.token}`,
    }

    const itemRes = await app.request('/api/items', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sku: uniqueSku(),
        name: 'Tx event test',
        specs: { tags: [] },
        material: 'GOLD',
        weight: '5.00',
        pricing: { unitPrice: '50.00', perGram: '5.00' },
        identification: { qrCode: 'qr-txevt' },
        initialQuantities: { warehouse: 10, point1: 0, point2: 0, point3: 0 },
      }),
    })
    const item = (await itemRes.json()) as { id: string }

    const received: Array<{ type: string; kind?: string }> = []
    subscribe((e) => {
      if (e.type === 'transaction.created') {
        received.push({ type: e.type, kind: e.kind })
      } else {
        received.push({ type: e.type })
      }
    })

    const res = await app.request('/api/transactions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        itemId: item.id,
        type: 'OUT',
        quantity: 3,
        from: 'warehouse',
      }),
    })
    expect(res.status).toBe(201)
    expect(received).toEqual([{ type: 'transaction.created', kind: 'OUT' }])
  })
})
