'use client'

import { apiBaseUrl } from '@/lib/api-client'
import { useAuthStore } from '@/lib/auth-store'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@jewelry/ui'
import { useState } from 'react'

async function downloadReport(path: string, token: string, filename: string) {
  const res = await fetch(`${apiBaseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Не удалось загрузить (${res.status})`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function ReportsPage() {
  const token = useAuthStore((s) => s.token)
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handle = async (kind: 'pdf' | 'xlsx') => {
    if (!token) return
    setBusy(kind)
    setError(null)
    try {
      if (kind === 'pdf') {
        await downloadReport('/api/reports/inventory.pdf', token, 'inventory.pdf')
      } else {
        await downloadReport('/api/reports/transactions.xlsx', token, 'transactions.xlsx')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-neutral-900">Отчёты</h2>
        <p className="text-sm text-neutral-500">Экспорт данных в PDF и XLSX</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Остатки — PDF</CardTitle>
            <CardDescription>Полный список товаров с количеством по каждой локации</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => handle('pdf')} disabled={busy !== null}>
              {busy === 'pdf' ? 'Генерируем…' : 'Скачать PDF'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Транзакции — XLSX</CardTitle>
            <CardDescription>Выгрузка последних 500 операций в Excel-формате</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => handle('xlsx')} disabled={busy !== null}>
              {busy === 'xlsx' ? 'Генерируем…' : 'Скачать XLSX'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
