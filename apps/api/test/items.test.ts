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
    name: 'Gold ring 585',
    specs: { tags: ['ring', 'gold'] },
    material: 'GOLD',
    carat: 585,
    weight: '3.45',
    pricing: { unitPrice: '5000.00', perGram: '1800.00' },
    identification: { qrCode: 'qr-001', barcode: 'br-001' },
    initialQuantities: { warehouse: 2, point1: 1, point2: 0, point3: 0 },
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
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
  }
}

describe('Items CRUD', () => {
  it('POST /api/items creates an item with inventory', async () => {
    const { app, headers } = await auth()
    const res = await app.request('/api/items', {
      method: 'POST',
      headers,
      body: JSON.stringify(itemBody()),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      id: string
      sku: string
      inventory: { quantities: { warehouse: number } }
    }
    expect(body.id).toMatch(/^c/)
    expect(body.inventory.quantities.warehouse).toBe(2)
  })

  it('POST /api/items rejects duplicate SKU with 409', async () => {
    const { app, headers } = await auth()
    const payload = itemBody()
    const first = await app.request('/api/items', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    expect(first.status).toBe(201)

    const second = await app.request('/api/items', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    expect(second.status).toBe(409)
  })

  it('POST /api/items without token returns 401', async () => {
    const app = makeTestApp()
    const res = await app.request('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itemBody()),
    })
    expect(res.status).toBe(401)
  })

  it('GET /api/items returns the list and total count', async () => {
    const { app, headers } = await auth()
    const a = await app.request('/api/items', {
      method: 'POST',
      headers,
      body: JSON.stringify(itemBody({ name: 'Ring A' })),
    })
    expect(a.status).toBe(201)
    const b = await app.request('/api/items', {
      method: 'POST',
      headers,
      body: JSON.stringify(itemBody({ name: 'Ring B' })),
    })
    expect(b.status).toBe(201)

    const listRes = await app.request('/api/items?take=50', { headers })
    expect(listRes.status).toBe(200)
    const listBody = (await listRes.json()) as {
      items: { id: string; name: string }[]
      total: number
    }
    expect(listBody.total).toBeGreaterThanOrEqual(2)
    const names = listBody.items.map((i) => i.name)
    expect(names).toContain('Ring A')
    expect(names).toContain('Ring B')
  })

  it('GET /api/items/:id returns an item and 404 on missing', async () => {
    const { app, headers } = await auth()
    const created = await app.request('/api/items', {
      method: 'POST',
      headers,
      body: JSON.stringify(itemBody()),
    })
    const createdBody = (await created.json()) as { id: string }

    const found = await app.request(`/api/items/${createdBody.id}`, { headers })
    expect(found.status).toBe(200)

    const missing = await app.request('/api/items/c0000000000000000000000000', {
      headers,
    })
    expect(missing.status).toBe(404)
  })

  it('PATCH /api/items/:id updates the item and writes history + audit', async () => {
    const { app, headers } = await auth()
    const created = await app.request('/api/items', {
      method: 'POST',
      headers,
      body: JSON.stringify(itemBody({ name: 'Original Ring' })),
    })
    const { id } = (await created.json()) as { id: string }

    const patched = await app.request(`/api/items/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ name: 'Renamed Ring' }),
    })
    expect(patched.status).toBe(200)
    const patchedBody = (await patched.json()) as { name: string }
    expect(patchedBody.name).toBe('Renamed Ring')

    const history = await prisma.itemHistory.findMany({ where: { itemId: id } })
    expect(history.length).toBeGreaterThanOrEqual(1)

    const audit = await prisma.auditLog.findMany({
      where: { entityId: id, action: 'item.update' },
    })
    expect(audit.length).toBeGreaterThanOrEqual(1)
  })
})
