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
  take: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
})
