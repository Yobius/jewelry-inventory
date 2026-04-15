'use client'

import { type ApiError, apiRequest } from '@/lib/api-client'
import { LOCATION_KEYS, LOCATION_LABELS } from '@/lib/format'
import type { Item, ItemsListResponse } from '@/lib/types'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Alert,
  Button,
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
} from '@jewelry/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

const schema = z
  .object({
    itemId: z.string().min(1, 'Выберите товар'),
    type: z.enum(['IN', 'OUT', 'MOVE']),
    quantity: z.coerce.number().int().positive('Количество > 0'),
    from: z.enum(['warehouse', 'point1', 'point2', 'point3']).optional(),
    to: z.enum(['warehouse', 'point1', 'point2', 'point3']).optional(),
    reason: z.string().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'IN' && !v.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'IN требует "куда"',
      })
    }
    if (v.type === 'OUT' && !v.from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['from'],
        message: 'OUT требует "откуда"',
      })
    }
    if (v.type === 'MOVE') {
      if (!v.from || !v.to) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['from'],
          message: 'MOVE требует обе локации',
        })
      } else if (v.from === v.to) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['to'],
          message: 'Локации должны различаться',
        })
      }
    }
  })
type TxForm = z.infer<typeof schema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TransactionDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient()

  const itemsQuery = useQuery<ItemsListResponse>({
    queryKey: ['items', { take: 100 }],
    queryFn: () => apiRequest<ItemsListResponse>('/api/items?take=100'),
    enabled: open,
  })

  const form = useForm<TxForm>({
    resolver: zodResolver(schema),
    defaultValues: { itemId: '', type: 'IN', quantity: 1, reason: '' },
  })

  useEffect(() => {
    if (!open) form.reset({ itemId: '', type: 'IN', quantity: 1, reason: '' })
  }, [open, form])

  const type = form.watch('type')

  const mutation = useMutation<unknown, ApiError, TxForm>({
    mutationFn: (values) => apiRequest('/api/transactions', { method: 'POST', body: values }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      onOpenChange(false)
    },
  })

  const items = itemsQuery.data?.items ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Новая транзакция</DialogTitle>
        <DialogDescription>Поступление, отгрузка или перемещение</DialogDescription>
      </DialogHeader>

      <form
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="itemId">Товар</Label>
          <Select id="itemId" {...form.register('itemId')}>
            <option value="">— выберите —</option>
            {items.map((item: Item) => (
              <option key={item.id} value={item.id}>
                {item.sku} — {item.name}
              </option>
            ))}
          </Select>
          {form.formState.errors.itemId && (
            <p className="text-xs text-red-600">{form.formState.errors.itemId.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type">Тип</Label>
            <Select id="type" {...form.register('type')}>
              <option value="IN">IN — приход</option>
              <option value="OUT">OUT — расход</option>
              <option value="MOVE">MOVE — перемещение</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quantity">Количество</Label>
            <Input id="quantity" type="number" {...form.register('quantity')} />
            {form.formState.errors.quantity && (
              <p className="text-xs text-red-600">{form.formState.errors.quantity.message}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {(type === 'OUT' || type === 'MOVE') && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="from">Откуда</Label>
              <Select id="from" {...form.register('from')}>
                <option value="">—</option>
                {LOCATION_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {LOCATION_LABELS[k]}
                  </option>
                ))}
              </Select>
              {form.formState.errors.from && (
                <p className="text-xs text-red-600">{form.formState.errors.from.message}</p>
              )}
            </div>
          )}
          {(type === 'IN' || type === 'MOVE') && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="to">Куда</Label>
              <Select id="to" {...form.register('to')}>
                <option value="">—</option>
                {LOCATION_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {LOCATION_LABELS[k]}
                  </option>
                ))}
              </Select>
              {form.formState.errors.to && (
                <p className="text-xs text-red-600">{form.formState.errors.to.message}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reason">Причина (опционально)</Label>
          <Input id="reason" {...form.register('reason')} />
        </div>

        {mutation.error && <Alert variant="destructive">{mutation.error.message}</Alert>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Сохраняем…' : 'Создать'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
