import { z } from 'zod'
import { locationKeys } from './inventory.js'

const locationEnum = z.enum(locationKeys)

export const createTransactionSchema = z
  .object({
    itemId: z.string().min(1),
    type: z.enum(['IN', 'OUT', 'MOVE', 'ADJUSTMENT']),
    quantity: z.number().int().positive(),
    from: locationEnum.optional(),
    to: locationEnum.optional(),
    reason: z.string().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    switch (value.type) {
      case 'IN':
        if (!value.to) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['to'],
            message: 'IN transactions require `to`',
          })
        }
        break
      case 'OUT':
        if (!value.from) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['from'],
            message: 'OUT transactions require `from`',
          })
        }
        break
      case 'MOVE':
        if (!value.from || !value.to) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['from'],
            message: 'MOVE transactions require both `from` and `to`',
          })
        } else if (value.from === value.to) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['to'],
            message: '`from` and `to` must differ',
          })
        }
        break
      case 'ADJUSTMENT':
        if (!value.to && !value.from) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['to'],
            message: 'ADJUSTMENT transactions require `to` or `from`',
          })
        }
        break
    }
  })

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>
