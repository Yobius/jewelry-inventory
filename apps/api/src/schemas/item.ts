import { z } from 'zod'

const decimalString = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'must be a decimal with up to 2 fractional digits')

const specsSchema = z.object({
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  depth: z.number().positive().optional(),
  tags: z.array(z.string().min(1)).default([]),
})

const pricingSchema = z.object({
  unitPrice: decimalString,
  perGram: decimalString,
})

const identificationSchema = z.object({
  qrCode: z.string().min(1),
  barcode: z.string().optional(),
})

const materialEnum = z.enum(['GOLD', 'SILVER', 'PLATINUM', 'OTHER'])

const quantitiesSchema = z
  .object({
    warehouse: z.number().int().min(0).default(0),
    point1: z.number().int().min(0).default(0),
    point2: z.number().int().min(0).default(0),
    point3: z.number().int().min(0).default(0),
  })
  .default({ warehouse: 0, point1: 0, point2: 0, point3: 0 })

export const createItemSchema = z.object({
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  specs: specsSchema,
  material: materialEnum,
  carat: z.number().int().min(0).max(999).optional(),
  weight: decimalString,
  pricing: pricingSchema,
  identification: identificationSchema,
  initialQuantities: quantitiesSchema.optional(),
})

export const updateItemSchema = createItemSchema.partial().omit({ initialQuantities: true })

export type CreateItemInput = z.infer<typeof createItemSchema>
export type UpdateItemInput = z.infer<typeof updateItemSchema>

export const listItemsQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(500).default(20),
  search: z.string().optional(),
  material: materialEnum.optional(),
  manufacturerId: z.string().optional(),
  supplierId: z.string().optional(),
  weightMin: z.coerce.number().min(0).optional(),
  weightMax: z.coerce.number().min(0).optional(),
  caratMin: z.coerce.number().int().min(0).max(999).optional(),
  caratMax: z.coerce.number().int().min(0).max(999).optional(),
  priceMin: z.coerce.number().min(0).optional(),
  priceMax: z.coerce.number().min(0).optional(),
  hasStones: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === true || v === 'true')),
  tag: z.string().optional(),
  /** Show only items with stock on this location (point1/point2/point3/warehouse). */
  location: z.enum(['warehouse', 'point1', 'point2', 'point3']).optional(),
  /** Show only items where total stock is <= 1. */
  lowStock: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === true || v === 'true')),
  /** Sort order */
  sort: z
    .enum([
      'created_desc',
      'created_asc',
      'sku_asc',
      'sku_desc',
      'total_desc',
      'total_asc',
      'warehouse_desc',
      'point1_desc',
      'point2_desc',
      'point3_desc',
    ])
    .optional(),
})
export type ListItemsQuery = z.infer<typeof listItemsQuerySchema>

// ---------- Bulk price update ----------

export const bulkPriceFilterSchema = z.object({
  material: materialEnum.optional(),
  manufacturerId: z.string().optional(),
  supplierId: z.string().optional(),
  weightMin: z.coerce.number().min(0).optional(),
  weightMax: z.coerce.number().min(0).optional(),
  caratMin: z.coerce.number().int().min(0).max(999).optional(),
  caratMax: z.coerce.number().int().min(0).max(999).optional(),
  tag: z.string().optional(),
})

export const bulkPriceSchema = z.object({
  filter: bulkPriceFilterSchema,
  /** Either 'fixed' (unitPrice=value) or 'perGramPlusWork' (unitPrice = weight*perGram + work). */
  formula: z.union([
    z.object({
      kind: z.literal('fixed'),
      unitPrice: decimalString,
    }),
    z.object({
      kind: z.literal('perGramPlusWork'),
      perGram: decimalString,
      work: decimalString.default('0'),
    }),
    z.object({
      kind: z.literal('percent'),
      /** Percentage change: +10 means +10%, -5 means -5% of current unitPrice */
      percent: z.coerce.number().min(-90).max(1000),
    }),
  ]),
  /** Safety: if estimated affected rows > cap, refuse to apply. Default 2000. */
  maxRows: z.coerce.number().int().min(1).max(50_000).default(2000),
  /** If true, only return the count + sample — don't write. */
  dryRun: z.coerce.boolean().default(false),
})
export type BulkPriceInput = z.infer<typeof bulkPriceSchema>
