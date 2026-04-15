'use client'

import { apiRequest } from '@/lib/api-client'
import type { Item, ItemsListResponse } from '@/lib/types'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@jewelry/ui'
import jsQR from 'jsqr'
import { useCallback, useEffect, useRef, useState } from 'react'

type ScanStatus = 'idle' | 'running' | 'error'

export default function ScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<ScanStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [match, setMatch] = useState<Item | null>(null)
  const [lastCode, setLastCode] = useState<string | null>(null)
  const rafRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const lastCodeRef = useRef<string | null>(null)

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    for (const t of streamRef.current?.getTracks() ?? []) t.stop()
    streamRef.current = null
    setStatus('idle')
  }, [])

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      for (const t of streamRef.current?.getTracks() ?? []) t.stop()
    }
  }, [])

  const handleMatch = useCallback(async (qr: string) => {
    try {
      const res = await apiRequest<ItemsListResponse>(
        `/api/items?search=${encodeURIComponent(qr)}&take=5`,
      )
      const found = res.items.find((item) => item.identification.qrCode === qr || item.sku === qr)
      if (found) {
        setMatch(found)
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
        rafRef.current = null
        for (const t of streamRef.current?.getTracks() ?? []) t.stop()
        streamRef.current = null
        setStatus('idle')
      }
    } catch {
      // silent — keep scanning
    }
  }, [])

  const scan = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scan)
      return
    }
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      rafRef.current = requestAnimationFrame(scan)
      return
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(imageData.data, canvas.width, canvas.height, {
      inversionAttempts: 'dontInvert',
    })
    if (code?.data && code.data !== lastCodeRef.current) {
      lastCodeRef.current = code.data
      setLastCode(code.data)
      void handleMatch(code.data)
    }
    rafRef.current = requestAnimationFrame(scan)
  }, [handleMatch])

  const start = async () => {
    setError(null)
    setMatch(null)
    setLastCode(null)
    lastCodeRef.current = null
    setStatus('running')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        scan()
      }
    } catch (e) {
      setStatus('error')
      setError(e instanceof Error ? e.message : 'Не удалось получить доступ к камере')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-neutral-900">QR-сканер</h2>
        <p className="text-sm text-neutral-500">Наведите камеру на QR-код товара</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Камера</CardTitle>
          <CardDescription>
            {status === 'running'
              ? 'Сканирование активно'
              : status === 'error'
                ? 'Ошибка'
                : 'Нажмите «Начать» чтобы активировать камеру'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="aspect-video w-full max-w-2xl overflow-hidden rounded-lg border border-neutral-200 bg-black">
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted>
              <track kind="captions" />
            </video>
          </div>
          <canvas ref={canvasRef} className="hidden" />
          <div className="flex gap-2">
            {status !== 'running' ? (
              <Button onClick={start}>Начать</Button>
            ) : (
              <Button variant="outline" onClick={stop}>
                Остановить
              </Button>
            )}
          </div>
          {error && <Alert variant="destructive">{error}</Alert>}
          {lastCode && !match && (
            <p className="text-sm text-neutral-600">
              Последний код: <span className="font-mono">{lastCode}</span> — товар не найден
            </p>
          )}
        </CardContent>
      </Card>

      {match && (
        <Card>
          <CardHeader>
            <CardTitle>Найден товар</CardTitle>
            <CardDescription>Сканирование остановлено</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt className="font-medium text-neutral-700">SKU</dt>
              <dd className="font-mono">{match.sku}</dd>
              <dt className="font-medium text-neutral-700">Название</dt>
              <dd>{match.name}</dd>
              <dt className="font-medium text-neutral-700">Материал</dt>
              <dd>{match.material}</dd>
              <dt className="font-medium text-neutral-700">Вес</dt>
              <dd>{match.weight} г</dd>
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
