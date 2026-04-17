import { z } from 'zod'

/**
 * Zod schemas for the three reference entities:
 *   - Manufacturer  (Виробник)
 *   - Supplier      (Постачальник)
 *   - Stone         (Вставка / камінь)
 *
 * Shared across routes + services.
 */

export const createManufacturerSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(40).optional(),
  country: z.string().min(2).max(80).optional(),
  notes: z.string().max(1000).optional(),
})
export const updateManufacturerSchema = createManufacturerSchema.partial()
export type CreateManufacturerInput = z.infer<typeof createManufacturerSchema>
export type UpdateManufacturerInput = z.infer<typeof updateManufacturerSchema>

export const createSupplierSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(40).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().min(3).max(40).optional(),
  notes: z.string().max(1000).optional(),
})
export const updateSupplierSchema = createSupplierSchema.partial()
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>

export const createStoneSchema = z.object({
  name: z.string().min(1).max(100),
  category: z.string().min(1).max(80).optional(),
})
export const updateStoneSchema = createStoneSchema.partial()
export type CreateStoneInput = z.infer<typeof createStoneSchema>
export type UpdateStoneInput = z.infer<typeof updateStoneSchema>

export const listQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().trim().optional(),
})
export type ListQuery = z.infer<typeof listQuerySchema>
