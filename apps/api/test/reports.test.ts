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

describe('reports routes', () => {
  it('GET /api/reports/inventory.pdf returns a PDF file', async () => {
    const app = makeTestApp()
    const user = await registerAndLogin(app)
    createdUserIds.push(user.id)
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.token}`,
    }

    // Seed one item so the report has at least one row.
    const itemRes = await app.request('/api/items', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sku: uniqueSku('PDF'),
        name: 'PDF Report Item',
        specs: { tags: [] },
        material: 'GOLD',
        weight: '2.50',
        pricing: { unitPrice: '100.00', perGram: '40.00' },
        identification: { qrCode: 'qr-pdf' },
        initialQuantities: { warehouse: 3, point1: 1, point2: 0, point3: 0 },
      }),
    })
    expect(itemRes.status).toBe(201)

    const res = await app.request('/api/reports/inventory.pdf', {
      method: 'GET',
      headers: { Authorization: `Bearer ${user.token}` },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')

    const buf = new Uint8Array(await res.arrayBuffer())
    expect(buf.length).toBeGreaterThan(4)
    // PDF magic bytes: %PDF
    expect(buf[0]).toBe(0x25)
    expect(buf[1]).toBe(0x50)
    expect(buf[2]).toBe(0x44)
    expect(buf[3]).toBe(0x46)
  })

  it('GET /api/reports/transactions.xlsx returns an XLSX file', async () => {
    const app = makeTestApp()
    const user = await registerAndLogin(app)
    createdUserIds.push(user.id)
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.token}`,
    }

    // Seed an item and a transaction so the sheet has at least one row.
    const itemRes = await app.request('/api/items', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sku: uniqueSku('XLSX'),
        name: 'XLSX Report Item',
        specs: { tags: [] },
        material: 'SILVER',
        weight: '1.00',
        pricing: { unitPrice: '10.00', perGram: '5.00' },
        identification: { qrCode: 'qr-xlsx' },
        initialQuantities: { warehouse: 5, point1: 0, point2: 0, point3: 0 },
      }),
    })
    const item = (await itemRes.json()) as { id: string }

    const txRes = await app.request('/api/transactions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        itemId: item.id,
        type: 'OUT',
        quantity: 2,
        from: 'warehouse',
      }),
    })
    expect(txRes.status).toBe(201)

    const res = await app.request('/api/reports/transactions.xlsx', {
      method: 'GET',
      headers: { Authorization: `Bearer ${user.token}` },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )

    const buf = new Uint8Array(await res.arrayBuffer())
    expect(buf.length).toBeGreaterThan(4)
    // XLSX is a ZIP archive — magic bytes PK\x03\x04
    expect(buf[0]).toBe(0x50)
    expect(buf[1]).toBe(0x4b)
    expect(buf[2]).toBe(0x03)
    expect(buf[3]).toBe(0x04)
  })

  it('reports routes require auth', async () => {
    const app = makeTestApp()
    const pdfRes = await app.request('/api/reports/inventory.pdf')
    expect(pdfRes.status).toBe(401)
    const xlsxRes = await app.request('/api/reports/transactions.xlsx')
    expect(xlsxRes.status).toBe(401)
  })
})
