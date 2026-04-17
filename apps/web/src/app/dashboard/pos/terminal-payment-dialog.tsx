'use client'

import { apiRequest } from '@/lib/api-client'
import {
  Alert,
  Button,
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@jewelry/ui'
import { useMutation, useQuery } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'

type PaymentLine = { itemId: string; sku: string; qty: number; unitPrice: string }

type CreatePaymentResponse = {
  payment: {
    id: string
    receiptId: string
    method: 'CASH' | 'CARD' | 'TERMINAL'
    status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'EXPIRED'
    amount: string
    paidAt: string | null
  }
  liqpay: {
    data: string
    signature: string
    actionUrl: string
  } | null
}

export type TerminalPaymentDialogProps = {
  open: boolean
  onOpenChange: (v: boolean) => void
  amount: number
  discountPct: number
  lines: PaymentLine[]
  onPaid: (receiptId: string) => void
}

export function TerminalPaymentDialog({
  open,
  onOpenChange,
  amount,
  discountPct,
  lines,
  onPaid,
}: TerminalPaymentDialogProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Create payment + signed LiqPay invoice as soon as the dialog opens.
  const create = useMutation<CreatePaymentResponse, Error, void>({
    mutationFn: () =>
      apiRequest<CreatePaymentResponse>('/api/payments', {
        method: 'POST',
        body: { method: 'TERMINAL', amount, discountPct, items: lines },
      }),
  })

  // biome-ignore lint/correctness/useExhaustiveDependencies: only react to `open` toggling
  useEffect(() => {
    if (open && !create.data && !create.isPending) {
      create.mutate()
    }
    if (!open) {
      create.reset()
      setQrDataUrl(null)
    }
  }, [open])

  // Build LiqPay URL and render a QR code for it.
  useEffect(() => {
    if (!create.data?.liqpay) return
    const { actionUrl, data, signature } = create.data.liqpay
    const url = `${actionUrl}?data=${encodeURIComponent(data)}&signature=${encodeURIComponent(signature)}`
    QRCode.toDataURL(url, { width: 280, margin: 1 }, (err: Error | null | undefined, u: string) => {
      if (!err) setQrDataUrl(u)
    })
  }, [create.data])

  const receiptId = create.data?.payment.receiptId
  const hasLiqpay = Boolean(create.data?.liqpay)

  // Poll payment status every 2s while the dialog is open
  const status = useQuery<CreatePaymentResponse['payment']>({
    queryKey: ['payment', receiptId],
    queryFn: () => apiRequest(`/api/payments/${receiptId}`),
    enabled: open && Boolean(receiptId),
    refetchInterval: (q) => {
      const s = q.state.data?.status
      return s && s !== 'PENDING' ? false : 2000
    },
  })

  // biome-ignore lint/correctness/useExhaustiveDependencies: only fire when status flips to SUCCESS
  useEffect(() => {
    if (status.data?.status === 'SUCCESS' && receiptId) {
      onPaid(receiptId)
    }
  }, [status.data?.status])

  const cancel = useMutation<unknown, Error, void>({
    mutationFn: () => {
      if (!receiptId) throw new Error('no receipt')
      return apiRequest(`/api/payments/${receiptId}/cancel`, { method: 'POST' })
    },
    onSuccess: () => onOpenChange(false),
  })

  const currentStatus = status.data?.status ?? 'PENDING'
  const isError = create.error || status.error
  const isConfigError = (create.error as Error & { status?: number })?.message?.includes(
    'LiqPay',
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Оплата через термінал (ПриватБанк)</DialogTitle>
        <DialogDescription>
          Сума: {amount.toFixed(2)} ₴
          {discountPct > 0 && ` · знижка ${discountPct}%`}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col items-center gap-4 py-4">
        {create.isPending && (
          <div className="text-sm text-neutral-500 dark:text-neutral-400">Готуємо QR…</div>
        )}

        {isConfigError && (
          <Alert variant="destructive">
            {(create.error as Error).message}
          </Alert>
        )}

        {isError && !isConfigError && (
          <Alert variant="destructive">
            {(create.error as Error | undefined)?.message ??
              (status.error as Error | undefined)?.message ??
              'Помилка'}
          </Alert>
        )}

        {hasLiqpay && qrDataUrl && currentStatus === 'PENDING' && (
          <>
            <p className="text-center text-sm text-neutral-700 dark:text-neutral-300">
              Скануй QR у Privat24 / Apple Pay / Google Pay
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt="LiqPay QR"
              className="rounded-lg border border-neutral-200 dark:border-neutral-800"
              width={280}
              height={280}
            />
            <canvas ref={canvasRef} className="hidden" />
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Чек: <span className="font-mono">{receiptId}</span>
            </p>
          </>
        )}

        {currentStatus === 'SUCCESS' && (
          <div className="flex flex-col items-center gap-2">
            <div className="text-5xl">✅</div>
            <div className="text-lg font-semibold text-green-700 dark:text-green-400">
              Оплачено
            </div>
            <div className="text-xs text-neutral-500">Чек: {receiptId}</div>
          </div>
        )}

        {currentStatus === 'FAILED' && (
          <div className="flex flex-col items-center gap-2">
            <div className="text-5xl">❌</div>
            <div className="text-lg font-semibold text-red-700 dark:text-red-400">
              Відхилено
            </div>
          </div>
        )}

        {currentStatus === 'CANCELLED' && (
          <div className="flex flex-col items-center gap-2">
            <div className="text-4xl">🚫</div>
            <div className="text-sm text-neutral-500">Скасовано</div>
          </div>
        )}
      </div>

      <DialogFooter>
        {currentStatus === 'PENDING' ? (
          <Button
            variant="outline"
            onClick={() => cancel.mutate()}
            disabled={cancel.isPending || !receiptId}
          >
            {cancel.isPending ? 'Скасовуємо…' : 'Скасувати'}
          </Button>
        ) : (
          <Button onClick={() => onOpenChange(false)}>Закрити</Button>
        )}
      </DialogFooter>
    </Dialog>
  )
}
