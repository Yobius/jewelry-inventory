import { prisma } from '@jewelry/db'
// bwip-js exposes the node build via the `/node` sub-export; it has its own typings
// eslint-disable-next-line @typescript-eslint/no-require-imports
import bwipjs from 'bwip-js/node'
import PDFDocument from 'pdfkit'

/**
 * Generate an A4 PDF with a grid of jewelry labels.
 * Each label contains:
 *   - SKU + name (top)
 *   - Material / carat / weight (middle)
 *   - Unit price (big)
 *   - Code 128 barcode (bottom)
 */

export type LabelFormat = '25x35' | '25x40' | '40x60' | '50x30'

const FORMATS: Record<
  LabelFormat,
  {
    widthMm: number
    heightMm: number
    /** columns × rows per A4 */
    cols: number
    rows: number
    /** inner padding in mm */
    padding: number
  }
> = {
  // small, standard jewelry tag
  '25x35': { widthMm: 25, heightMm: 35, cols: 7, rows: 8, padding: 1.5 },
  '25x40': { widthMm: 25, heightMm: 40, cols: 7, rows: 7, padding: 1.5 },
  '40x60': { widthMm: 40, heightMm: 60, cols: 5, rows: 4, padding: 2 },
  '50x30': { widthMm: 50, heightMm: 30, cols: 4, rows: 9, padding: 2 },
}

const MM_TO_PT = 2.83465 // 1mm ≈ 2.83465 typographic points

function mm(v: number): number {
  return v * MM_TO_PT
}

async function makeCode128(data: string, widthMm: number, heightMm: number): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: 'code128',
    text: data,
    scale: 3,
    height: heightMm,
    width: widthMm,
    includetext: false,
    paddingwidth: 0,
    paddingheight: 0,
    backgroundcolor: 'FFFFFF',
  })
}

export type LabelItem = {
  id: string
  sku: string
  name: string
  material: 'GOLD' | 'SILVER' | 'PLATINUM' | 'OTHER'
  carat: number | null
  weight: string
  unitPrice: string
  barcodeValue: string
  /** How many copies to print of this item */
  copies: number
}

export async function renderLabelsPdf(
  items: LabelItem[],
  format: LabelFormat = '25x35',
): Promise<Buffer> {
  const fmt = FORMATS[format]
  // A4 = 210 × 297 mm
  const labelsPerPage = fmt.cols * fmt.rows
  // "Unroll" copies — each copy is a separate cell on the grid
  const expanded: LabelItem[] = []
  for (const it of items) {
    for (let i = 0; i < Math.max(1, it.copies); i++) expanded.push(it)
  }

  const doc = new PDFDocument({ size: 'A4', margin: mm(5) })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(chunks))))

  // Compute grid
  const marginMm = 5
  const usableW = 210 - 2 * marginMm
  const usableH = 297 - 2 * marginMm
  const stepX = usableW / fmt.cols
  const stepY = usableH / fmt.rows

  for (let i = 0; i < expanded.length; i++) {
    const page = Math.floor(i / labelsPerPage)
    const cellIdx = i % labelsPerPage
    if (cellIdx === 0 && page > 0) doc.addPage({ size: 'A4', margin: mm(5) })

    const col = cellIdx % fmt.cols
    const row = Math.floor(cellIdx / fmt.cols)
    const x0 = mm(marginMm + col * stepX)
    const y0 = mm(marginMm + row * stepY)
    const cellW = mm(stepX)
    const cellH = mm(stepY)

    await drawLabel(doc, expanded[i]!, x0, y0, cellW, cellH, fmt.padding)
  }

  doc.end()
  return done
}

async function drawLabel(
  doc: PDFKit.PDFDocument,
  item: LabelItem,
  x: number,
  y: number,
  w: number,
  h: number,
  paddingMm: number,
): Promise<void> {
  const pad = mm(paddingMm)
  const innerW = w - 2 * pad
  const innerX = x + pad
  const innerY = y + pad

  // Outer border (thin, useful for cutting)
  doc.save().lineWidth(0.3).strokeColor('#cccccc').rect(x, y, w, h).stroke().restore()

  // Line 1 — SKU (small bold)
  doc
    .font('Helvetica-Bold')
    .fontSize(6)
    .fillColor('#000000')
    .text(item.sku, innerX, innerY, { width: innerW, lineBreak: false, ellipsis: true })

  // Line 2 — Name (slightly bigger)
  doc
    .font('Helvetica')
    .fontSize(5.5)
    .text(item.name, innerX, innerY + 8, {
      width: innerW,
      height: 14,
      lineBreak: true,
      ellipsis: true,
    })

  // Material / carat / weight
  const mat = [item.material, item.carat ? `${item.carat}°` : null, `${item.weight}г`]
    .filter(Boolean)
    .join(' · ')
  doc
    .font('Helvetica')
    .fontSize(5)
    .fillColor('#555555')
    .text(mat, innerX, innerY + 22, { width: innerW, lineBreak: false, ellipsis: true })

  // Price (big)
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor('#000000')
    .text(`${item.unitPrice} ₴`, innerX, innerY + 30, {
      width: innerW,
      align: 'center',
      lineBreak: false,
    })

  // Barcode (bottom half)
  const barcodeMmW = Math.max(15, w / MM_TO_PT - 2 * paddingMm - 1)
  const barcodeMmH = Math.max(8, (h / MM_TO_PT) * 0.3)
  try {
    const png = await makeCode128(item.barcodeValue, barcodeMmW, barcodeMmH)
    const by = y + h - mm(paddingMm + barcodeMmH + 2)
    doc.image(png, innerX, by, { width: innerW, height: mm(barcodeMmH) })
    // Small barcode value text
    doc
      .font('Helvetica')
      .fontSize(4.5)
      .fillColor('#333')
      .text(item.barcodeValue, innerX, y + h - mm(paddingMm + 1.5), {
        width: innerW,
        align: 'center',
        lineBreak: false,
      })
  } catch (e) {
    doc
      .font('Helvetica')
      .fontSize(5)
      .fillColor('#aa0000')
      .text(`BC err: ${(e as Error).message.slice(0, 30)}`, innerX, y + h - mm(8), {
        width: innerW,
      })
  }
}

/** Fetch items by IDs with copies; suitable for rendering labels. */
export async function fetchLabelItems(
  requests: { itemId: string; copies: number }[],
): Promise<LabelItem[]> {
  const ids = requests.map((r) => r.itemId)
  if (ids.length === 0) return []
  const items = await prisma.item.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      sku: true,
      name: true,
      material: true,
      carat: true,
      weight: true,
      pricing: true,
      identification: true,
    },
  })
  const byId = new Map(items.map((i) => [i.id, i]))

  return requests
    .map((r) => {
      const i = byId.get(r.itemId)
      if (!i) return null
      const pricing = (i.pricing ?? {}) as { unitPrice?: string }
      const ident = (i.identification ?? {}) as { barcode?: string; qrCode?: string }
      return {
        id: i.id,
        sku: i.sku,
        name: i.name,
        material: i.material,
        carat: i.carat,
        weight: i.weight.toString(),
        unitPrice: String(pricing.unitPrice ?? '0'),
        barcodeValue: ident.barcode?.trim() || i.sku,
        copies: Math.max(1, r.copies),
      } satisfies LabelItem
    })
    .filter((x): x is LabelItem => x !== null)
}

export async function createPrintJobs(
  itemIds: string[],
  userId: string,
  copies = 1,
  batchId?: string,
): Promise<void> {
  if (itemIds.length === 0) return
  await prisma.printJob.createMany({
    data: itemIds.map((id) => ({
      itemId: id,
      userId,
      copies,
      batchId,
      status: 'QUEUED',
    })),
  })
}

export async function markPrintJobsPrinted(ids: string[]): Promise<number> {
  const { count } = await prisma.printJob.updateMany({
    where: { id: { in: ids } },
    data: { status: 'PRINTED', printedAt: new Date() },
  })
  return count
}
