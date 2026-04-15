'use client'

import { type ApiError, apiRequest } from '@/lib/api-client'
import type { Item } from '@/lib/types'
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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

const decimalString = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Число с точностью до 0.01')

const itemFormSchema = z.object({
  sku: z.string().min(1, 'SKU обязательно'),
  name: z.string().min(1, 'Название обязательно'),
  material: z.enum(['GOLD', 'SILVER', 'PLATINUM', 'OTHER']),
  weight: decimalString,
  unitPrice: decimalString,
  perGram: decimalString,
  qrCode: z.string().min(1, 'QR-код обязателен'),
  tags: z.string().optional(),
  warehouse: z.coerce.number().int().min(0).default(0),
  point1: z.coerce.number().int().min(0).default(0),
  point2: z.coerce.number().int().min(0).default(0),
  point3: z.coerce.number().int().min(0).default(0),
})
type ItemForm = z.infer<typeof itemFormSchema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialItem?: Item | null
}

const defaultValues: ItemForm = {
  sku: '',
  name: '',
  material: 'SILVER',
  weight: '0.00',
  unitPrice: '0.00',
  perGram: '0.00',
  qrCode: '',
  tags: '',
  warehouse: 0,
  point1: 0,
  point2: 0,
  point3: 0,
}

export function ItemFormDialog({ open, onOpenChange, initialItem }: Props) {
  const queryClient = useQueryClient()
  const isEdit = Boolean(initialItem)

  const form = useForm<ItemForm>({
    resolver: zodResolver(itemFormSchema),
    defaultValues,
  })

  useEffect(() => {
    if (!open) return
    if (initialItem) {
      form.reset({
        sku: initialItem.sku,
        name: initialItem.name,
        material: initialItem.material,
        weight: initialItem.weight,
        unitPrice: initialItem.pricing.unitPrice,
        perGram: initialItem.pricing.perGram,
        qrCode: initialItem.identification.qrCode,
        tags: initialItem.specs.tags?.join(', ') ?? '',
        warehouse: initialItem.inventory?.quantities.warehouse ?? 0,
        point1: initialItem.inventory?.quantities.point1 ?? 0,
        point2: initialItem.inventory?.quantities.point2 ?? 0,
        point3: initialItem.inventory?.quantities.point3 ?? 0,
      })
    } else {
      form.reset(defaultValues)
    }
  }, [open, initialItem, form])

  const mutation = useMutation<unknown, ApiError, ItemForm>({
    mutationFn: async (values) => {
      const body = {
        sku: values.sku,
        name: values.name,
        material: values.material,
        weight: values.weight,
        specs: {
          tags: values.tags
            ? values.tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)
            : [],
        },
        pricing: { unitPrice: values.unitPrice, perGram: values.perGram },
        identification: { qrCode: values.qrCode },
        ...(isEdit
          ? {}
          : {
              initialQuantities: {
                warehouse: values.warehouse,
                point1: values.point1,
                point2: values.point2,
                point3: values.point3,
              },
            }),
      }
      if (isEdit && initialItem) {
        return apiRequest(`/api/items/${initialItem.id}`, { method: 'PATCH', body })
      }
      return apiRequest('/api/items', { method: 'POST', body })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      onOpenChange(false)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{isEdit ? 'Редактировать товар' : 'Новый товар'}</DialogTitle>
        <DialogDescription>
          {isEdit ? 'Обновите поля товара' : 'Заполните карточку нового товара'}
        </DialogDescription>
      </DialogHeader>

      <form
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        className="flex flex-col gap-4"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sku">SKU</Label>
            <Input id="sku" {...form.register('sku')} disabled={isEdit} />
            {form.formState.errors.sku && (
              <p className="text-xs text-red-600">{form.formState.errors.sku.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Название</Label>
            <Input id="name" {...form.register('name')} />
            {form.formState.errors.name && (
              <p className="text-xs text-red-600">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="material">Материал</Label>
            <Select id="material" {...form.register('material')}>
              <option value="GOLD">GOLD</option>
              <option value="SILVER">SILVER</option>
              <option value="PLATINUM">PLATINUM</option>
              <option value="OTHER">OTHER</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="weight">Вес (г)</Label>
            <Input id="weight" {...form.register('weight')} />
            {form.formState.errors.weight && (
              <p className="text-xs text-red-600">{form.formState.errors.weight.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unitPrice">Цена</Label>
            <Input id="unitPrice" {...form.register('unitPrice')} />
            {form.formState.errors.unitPrice && (
              <p className="text-xs text-red-600">{form.formState.errors.unitPrice.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="perGram">Цена за грамм</Label>
            <Input id="perGram" {...form.register('perGram')} />
            {form.formState.errors.perGram && (
              <p className="text-xs text-red-600">{form.formState.errors.perGram.message}</p>
            )}
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="qrCode">QR-код</Label>
            <Input id="qrCode" {...form.register('qrCode')} />
            {form.formState.errors.qrCode && (
              <p className="text-xs text-red-600">{form.formState.errors.qrCode.message}</p>
            )}
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="tags">Теги (через запятую)</Label>
            <Input id="tags" {...form.register('tags')} />
          </div>
          {!isEdit && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="warehouse">Склад</Label>
                <Input id="warehouse" type="number" {...form.register('warehouse')} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="point1">Точка 1</Label>
                <Input id="point1" type="number" {...form.register('point1')} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="point2">Точка 2</Label>
                <Input id="point2" type="number" {...form.register('point2')} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="point3">Точка 3</Label>
                <Input id="point3" type="number" {...form.register('point3')} />
              </div>
            </>
          )}
        </div>

        {mutation.error && <Alert variant="destructive">{mutation.error.message}</Alert>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
