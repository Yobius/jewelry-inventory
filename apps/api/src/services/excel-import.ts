import { Prisma, prisma } from '@jewelry/db'
import ExcelJS from 'exceljs'
import { writeAudit } from '../lib/audit.js'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type ParsedHeader = string

export type ParsedRow = Record<string, string | number | null>

/** One of our Item fields that can be mapped from an Excel column. */
export type ItemField =
  | 'sku'
  | 'name'
  | 'material'
  | 'carat'
  | 'weight'
  | 'unitPrice'
  | 'perGram'
  | 'barcode'
  | 'quantity'
  | 'tags'
  | 'manufacturer'
  | 'stones'

export type FieldMapping = Partial<Record<ItemField, string>>

export type MaterialTransform = Record<string, 'GOLD' | 'SILVER' | 'PLATINUM' | 'OTHER'>

export type ParsedExcel = {
  sheetName: string
  headers: ParsedHeader[]
  rowCount: number
  sampleRows: ParsedRow[]
  autoMapping: FieldMapping
}

// -----------------------------------------------------------------------------
// Auto-detection heuristics
// -----------------------------------------------------------------------------

/**
 * Guess which Excel column corresponds to each Item field.
 * Handles UA/RU/EN spellings the typical jewelry invoice uses.
 */
const AUTO_DETECT_PATTERNS: Record<ItemField, RegExp[]> = {
  sku: [/^\s*(sku|артикул|art\s*num|код(?!\s*отр)|артикль)\s*$/i],
  name: [/^\s*(name|назва|наимен|наим|product|товар|виріб|изделие)/i],
  material: [/^\s*(material|метал|мет\.?|тип\s*метал)/i],
  carat: [/^\s*(carat|проба|сплав)/i],
  weight: [/^\s*(weight|вага|вес|масса|гр\.?|грам\w*)/i],
  unitPrice: [
    /^\s*(price|ціна(?!.*грам)|цена(?!.*грам)|вартість|roz\.?price|roz\s*ціна|outprice|out\s*price)\s*$/i,
  ],
  perGram: [/^\s*(per\s*gram|за\s*грам|ціна\s*за\s*г|цена\s*за\s*г|грам\s*ціна|per\s*g)/i],
  barcode: [/^\s*(barcode|штрих[-\s]?код|bar[-\s]?code|ean)/i],
  quantity: [/^\s*(q(ty|uantity)|кол[-\s]?во|кількість|количество|шт|к-сть)/i],
  tags: [/^\s*(tags|категорія|категория|group|группа|вид)/i],
  manufacturer: [/^\s*(manufacturer|виробник|производитель|фабрика|firm|фірма|фирма|brand|бренд)/i],
  stones: [/^\s*(stones?|камні|камен(ь|і)|вставк[аи]|insert)/i],
}

function autoDetect(headers: ParsedHeader[]): FieldMapping {
  const mapping: FieldMapping = {}
  for (const [field, patterns] of Object.entries(AUTO_DETECT_PATTERNS) as [ItemField, RegExp[]][]) {
    for (const h of headers) {
      if (!h) continue
      if (patterns.some((p) => p.test(h))) {
        mapping[field] = h
        break
      }
    }
  }
  return mapping
}

// -----------------------------------------------------------------------------
// Parse
// -----------------------------------------------------------------------------

/**
 * Parse an uploaded Excel file and return headers + first N rows + auto-mapping.
 * Uses the first worksheet; first row is treated as headers.
 */
export async function parseExcel(buffer: ArrayBuffer, sampleSize = 10): Promise<ParsedExcel> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(buffer) as unknown as Parameters<typeof wb.xlsx.load>[0])
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('Excel: не знайдено жодного аркуша')

  // Headers = first row values (skip index 0 which is null in exceljs)
  const headerRow = ws.getRow(1).values as (string | number | undefined)[]
  const headers: ParsedHeader[] = []
  for (let i = 1; i < headerRow.length; i++) {
    const v = headerRow[i]
    headers.push(v == null ? `column_${i}` : String(v).trim())
  }

  const rowCount = Math.max(0, ws.rowCount - 1)
  const sampleRows: ParsedRow[] = []
  const limit = Math.min(sampleSize + 1, ws.rowCount)
  for (let r = 2; r <= limit; r++) {
    const row = ws.getRow(r).values as (string | number | Date | null | undefined)[]
    const obj: ParsedRow = {}
    for (let c = 1; c <= headers.length; c++) {
      const header = headers[c - 1]
      if (!header) continue
      const v = row?.[c]
      obj[header] = normalizeCell(v)
    }
    sampleRows.push(obj)
  }

  return {
    sheetName: ws.name,
    headers,
    rowCount,
    sampleRows,
    autoMapping: autoDetect(headers),
  }
}

function normalizeCell(v: unknown): string | number | null {
  if (v == null) return null
  if (typeof v === 'number') return v
  if (v instanceof Date) return v.toISOString()
  // exceljs can return { richText: [...] } or { result, formula }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('result' in o) return normalizeCell(o.result)
    if ('richText' in o && Array.isArray(o.richText)) {
      return o.richText.map((r: { text?: string }) => r.text ?? '').join('')
    }
    if ('text' in o) return String((o as { text: unknown }).text)
  }
  return String(v).trim() || null
}

// -----------------------------------------------------------------------------
// Execute (full row iteration + upsert)
// -----------------------------------------------------------------------------

export type ExecuteInput = {
  buffer: ArrayBuffer
  supplierId?: string
  mappingName?: string
  fieldMapping: FieldMapping
  materialTransform?: MaterialTransform
  /** Where to put the initial stock. Defaults to warehouse. */
  initialLocation?: 'warehouse' | 'point1' | 'point2' | 'point3'
  /** Default quantity per row if `quantity` field isn't mapped. Defaults to 1. */
  defaultQuantity?: number
  /** Skip rows where SKU is missing or weight is 0. */
  skipInvalid?: boolean
  filename: string
  userId: string
  /** If provided, save this mapping as ImportMapping for reuse. */
  saveMappingAs?: string
}

export type ExecuteResult = {
  importId: string
  rowsTotal: number
  rowsCreated: number
  rowsUpdated: number
  rowsSkipped: number
  errors: { row: number; field?: string; message: string }[]
}

type RowContext = {
  row: number
  raw: ParsedRow
}

export async function executeImport(input: ExecuteInput): Promise<ExecuteResult> {
  const parsed = await parseExcel(input.buffer, 0)
  const headers = parsed.headers
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(input.buffer) as unknown as Parameters<typeof wb.xlsx.load>[0])
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('Excel: не знайдено жодного аркуша')

  const location = input.initialLocation ?? 'warehouse'
  const defaultQty = input.defaultQuantity ?? 1
  const materialTransform = { ...DEFAULT_MATERIAL_TRANSFORM, ...(input.materialTransform ?? {}) }

  // Create Import log
  const importRow = await prisma.import.create({
    data: {
      supplierId: input.supplierId,
      userId: input.userId,
      filename: input.filename,
      rowsTotal: parsed.rowCount,
      status: 'in-progress',
    },
  })

  // Optionally save mapping for reuse
  if (input.saveMappingAs && input.supplierId) {
    try {
      await prisma.importMapping.upsert({
        where: {
          supplierId_name: { supplierId: input.supplierId, name: input.saveMappingAs },
        },
        update: {
          mapping: input.fieldMapping as unknown as Prisma.InputJsonValue,
          transforms: input.materialTransform
            ? ({ material: input.materialTransform } as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
        create: {
          supplierId: input.supplierId,
          name: input.saveMappingAs,
          mapping: input.fieldMapping as unknown as Prisma.InputJsonValue,
          transforms: input.materialTransform
            ? ({ material: input.materialTransform } as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      })
    } catch (e) {
      // Non-fatal — continue import
      console.error('failed to save mapping:', (e as Error).message)
    }
  }

  const errors: ExecuteResult['errors'] = []
  let created = 0
  let updated = 0
  let skipped = 0

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r).values as (string | number | Date | null | undefined)[]
    const raw: ParsedRow = {}
    for (let c = 1; c <= headers.length; c++) {
      const h = headers[c - 1]
      if (!h) continue
      raw[h] = normalizeCell(row?.[c])
    }
    const ctx: RowContext = { row: r, raw }

    try {
      const item = buildItemPayload(ctx, input.fieldMapping, materialTransform)
      if (!item) {
        if (input.skipInvalid) {
          skipped++
          continue
        }
        throw new Error('Invalid row (missing sku or weight)')
      }

      const qtyN = Math.max(0, Math.floor(Number(item._qty ?? defaultQty)))

      const existing = await prisma.item.findUnique({
        where: { sku: item.sku },
        include: { inventory: true },
      })

      if (existing) {
        await prisma.item.update({
          where: { sku: item.sku },
          data: {
            name: item.name,
            material: item.material,
            carat: item.carat,
            weight: item.weight,
            specs: item.specs,
            pricing: item.pricing,
            identification: item.identification,
            supplierId: input.supplierId ?? existing.supplierId,
          },
        })
        const curQ = (existing.inventory?.quantities ?? ZERO_Q) as Record<string, number>
        const newQ = { ...ZERO_Q, ...curQ, [location]: Number(curQ[location] ?? 0) + qtyN }
        await prisma.inventory.upsert({
          where: { itemId: existing.id },
          update: { quantities: newQ },
          create: { itemId: existing.id, quantities: newQ },
        })
        updated++
      } else {
        await prisma.item.create({
          data: {
            sku: item.sku,
            name: item.name,
            specs: item.specs,
            material: item.material,
            carat: item.carat,
            weight: item.weight,
            pricing: item.pricing,
            identification: item.identification,
            createdBy: input.userId,
            supplierId: input.supplierId,
            inventory: {
              create: {
                quantities: { ...ZERO_Q, [location]: qtyN },
              },
            },
          },
        })
        created++
      }
    } catch (e) {
      errors.push({ row: ctx.row, message: (e as Error).message })
    }
  }

  const done = await prisma.import.update({
    where: { id: importRow.id },
    data: {
      rowsCreated: created,
      rowsUpdated: updated,
      rowsSkipped: skipped,
      errors: errors.length ? (errors as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      status: errors.length > 0 ? 'completed-with-errors' : 'completed',
      completedAt: new Date(),
    },
  })

  await writeAudit({
    userId: input.userId,
    action: 'import.excel',
    entityId: done.id,
    metadata: {
      filename: input.filename,
      created,
      updated,
      skipped,
      errorCount: errors.length,
    },
  })

  return {
    importId: done.id,
    rowsTotal: parsed.rowCount,
    rowsCreated: created,
    rowsUpdated: updated,
    rowsSkipped: skipped,
    errors,
  }
}

// -----------------------------------------------------------------------------
// Row → payload
// -----------------------------------------------------------------------------

const ZERO_Q = { warehouse: 0, point1: 0, point2: 0, point3: 0 } as const

const DEFAULT_MATERIAL_TRANSFORM: MaterialTransform = {
  GOLD: 'GOLD',
  SILVER: 'SILVER',
  PLATINUM: 'PLATINUM',
  OTHER: 'OTHER',
  золото: 'GOLD',
  золот: 'GOLD',
  au: 'GOLD',
  ag: 'SILVER',
  pt: 'PLATINUM',
  срібло: 'SILVER',
  сребро: 'SILVER',
  серебро: 'SILVER',
  сер: 'SILVER',
  платина: 'PLATINUM',
}

function readStringCell(raw: ParsedRow, key?: string): string | null {
  if (!key) return null
  const v = raw[key]
  if (v == null) return null
  return String(v).trim() || null
}

function readNumberCell(raw: ParsedRow, key?: string): number | null {
  if (!key) return null
  const v = raw[key]
  if (v == null) return null
  if (typeof v === 'number') return v
  const s = String(v).replace(',', '.').trim()
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function normalizeMaterial(
  raw: string | null,
  transform: MaterialTransform,
): 'GOLD' | 'SILVER' | 'PLATINUM' | 'OTHER' {
  if (!raw) return 'OTHER'
  const k = raw.trim().toLowerCase()
  if (transform[k]) return transform[k]
  // try exact match first (lowercase transform keys)
  for (const [src, dst] of Object.entries(transform)) {
    if (k.includes(src.toLowerCase())) return dst
  }
  return 'OTHER'
}

function buildItemPayload(
  ctx: RowContext,
  mapping: FieldMapping,
  materialTransform: MaterialTransform,
): {
  sku: string
  name: string
  material: 'GOLD' | 'SILVER' | 'PLATINUM' | 'OTHER'
  carat: number | null
  weight: Prisma.Decimal
  pricing: Prisma.JsonObject
  identification: Prisma.JsonObject
  specs: Prisma.JsonObject
  _qty?: number
} | null {
  const sku = readStringCell(ctx.raw, mapping.sku)
  if (!sku) return null
  const name = readStringCell(ctx.raw, mapping.name) ?? sku

  const materialRaw = readStringCell(ctx.raw, mapping.material)
  const material = normalizeMaterial(materialRaw, materialTransform)

  const caratRaw = readNumberCell(ctx.raw, mapping.carat)
  const carat =
    caratRaw != null && Number.isInteger(caratRaw) && caratRaw >= 0 && caratRaw <= 999
      ? caratRaw
      : null

  const weightNum = readNumberCell(ctx.raw, mapping.weight)
  if (weightNum == null || weightNum <= 0) return null
  const weight = new Prisma.Decimal(weightNum.toFixed(2))

  const unitPrice = new Prisma.Decimal((readNumberCell(ctx.raw, mapping.unitPrice) ?? 0).toFixed(2))
  const perGram = new Prisma.Decimal((readNumberCell(ctx.raw, mapping.perGram) ?? 0).toFixed(2))

  const barcode = readStringCell(ctx.raw, mapping.barcode)
  const tagsRaw = readStringCell(ctx.raw, mapping.tags)
  const stonesRaw = readStringCell(ctx.raw, mapping.stones)
  const manufacturerRaw = readStringCell(ctx.raw, mapping.manufacturer)
  const qtyFromRow = readNumberCell(ctx.raw, mapping.quantity)

  const tags: string[] = []
  if (tagsRaw) tags.push(tagsRaw)
  if (manufacturerRaw) tags.push(`manufacturer:${manufacturerRaw}`)

  const specs: Prisma.JsonObject = { tags }
  if (stonesRaw) specs.stonesInfo = stonesRaw

  return {
    sku,
    name,
    material,
    carat,
    weight,
    pricing: { unitPrice: unitPrice.toString(), perGram: perGram.toString() },
    identification: {
      qrCode: `JWL-XLS-${sku}`,
      ...(barcode ? { barcode } : {}),
    },
    specs,
    _qty: qtyFromRow ?? undefined,
  }
}
