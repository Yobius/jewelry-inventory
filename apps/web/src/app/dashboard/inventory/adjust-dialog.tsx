'use client'

import { type ApiError, apiRequest } from '@/lib/api-client'
import { LOCATION_LABELS } from '@/lib/format'
import type { Item } from '@/lib/types'
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
} from '@jewelry/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

type Quantities = { warehouse: number; point1: number; point2: number; point3: number }

type Props = {
  item: Item | null
  onOpenChange: (open: boolean) => void
}

export function AdjustDialog({ item, onOpenChange }: Props) {
  const queryClient = useQueryClient()
  const [values, setValues] = useState<Quantities>({
    warehouse: 0,
    point1: 0,
    point2: 0,
    point3: 0,
  })

  useEffect(() => {
    if (!item) return
    const q = item.inventory?.quantities ?? {}
    setValues({
      warehouse: q.warehouse ?? 0,
      point1: q.point1 ?? 0,
      point2: q.point2 ?? 0,
      point3: q.point3 ?? 0,
    })
  }, [item])

  const mutation = useMutation<unknown, ApiError, Quantities>({
    mutationFn: (v) =>
      apiRequest(`/api/inventory/${item?.id}`, {
        method: 'PATCH',
        body: v,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      onOpenChange(false)
    },
  })

  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Коррекция остатков</DialogTitle>
        <DialogDescription>{item?.name}</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        {(Object.keys(values) as (keyof Quantities)[]).map((key) => (
          <div key={key} className="flex flex-col gap-1.5">
            <Label htmlFor={`adj-${key}`}>{LOCATION_LABELS[key]}</Label>
            <Input
              id={`adj-${key}`}
              type="number"
              value={values[key]}
              onChange={(e) => setValues({ ...values, [key]: Number(e.target.value) || 0 })}
            />
          </div>
        ))}

        {mutation.error && <Alert variant="destructive">{mutation.error.message}</Alert>}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Отмена
        </Button>
        <Button onClick={() => mutation.mutate(values)} disabled={mutation.isPending}>
          {mutation.isPending ? 'Сохраняем…' : 'Применить'}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
