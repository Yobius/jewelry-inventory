import { z } from 'zod'

export const locationKeys = ['warehouse', 'point1', 'point2', 'point3'] as const
export type LocationKey = (typeof locationKeys)[number]

export const adjustInventorySchema = z
  .object({
    warehouse: z.number().int().min(0).optional(),
    point1: z.number().int().min(0).optional(),
    point2: z.number().int().min(0).optional(),
    point3: z.number().int().min(0).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: 'at least one location must be provided',
  })

export type AdjustInventoryInput = z.infer<typeof adjustInventorySchema>
