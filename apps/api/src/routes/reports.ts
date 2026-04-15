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
    c.header('Content-Type', 'application/pdf')
    c.header('Content-Disposition', 'attachment; filename="inventory.pdf"')
    c.header('Content-Length', String(pdf.byteLength))
    return c.body(pdf as unknown as ArrayBuffer)
  })

  route.get('/transactions.xlsx', async (c) => {
    const rows = await loadTransactionsReport()
    const xlsx = await renderTransactionsXlsx(rows)
    c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    c.header('Content-Disposition', 'attachment; filename="transactions.xlsx"')
    c.header('Content-Length', String(xlsx.byteLength))
    return c.body(xlsx as unknown as ArrayBuffer)
  })

  return route
}

async function renderInventoryPdf(
  rows: Awaited<ReturnType<typeof loadInventoryReport>>,
): Promise<Uint8Array> {
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
    let headerX = doc.page.margins.left
    const startY = doc.y
    doc.fontSize(9).font('Helvetica-Bold')
    headers.forEach((h, i) => {
      const width = widths[i] ?? 50
      doc.text(h, headerX, startY, { width, align: 'left' })
      headerX += width
    })
    doc.moveDown(0.5)
    doc.font('Helvetica')

    for (const row of rows) {
      const rowY = doc.y
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
        doc.text(cell, cx, rowY, { width, align: 'left' })
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
