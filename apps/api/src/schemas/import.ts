import { z } from 'zod'

const materialEnum = z.enum(['GOLD', 'SILVER', 'PLATINUM', 'OTHER'])

export const fieldMappingSchema = z.object({
  sku: z.string().optional(),
  name: z.string().optional(),
  material: z.string().optional(),
  carat: z.string().optional(),
  weight: z.string().optional(),
  unitPrice: z.string().optional(),
  perGram: z.string().optional(),
  barcode: z.string().optional(),
  quantity: z.string().optional(),
  tags: z.string().optional(),
  manufacturer: z.string().optional(),
  stones: z.string().optional(),
})
export type FieldMappingInput = z.infer<typeof fieldMappingSchema>

export const executeImportSchema = z.object({
  supplierId: z.string().optional(),
  saveMappingAs: z.string().min(1).max(120).optional(),
  fieldMapping: fieldMappingSchema,
  materialTransform: z.record(materialEnum).optional(),
  initialLocation: z.enum(['warehouse', 'point1', 'point2', 'point3']).default('warehouse'),
  defaultQuantity: z.coerce.number().int().min(0).max(10_000).default(1),
  skipInvalid: z.coerce.boolean().default(true),
})
export type ExecuteImportInput = z.infer<typeof executeImportSchema>
