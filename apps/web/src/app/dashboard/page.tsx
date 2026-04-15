'use client'

import { useAuthStore } from '@/lib/auth-store'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@jewelry/ui'

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-neutral-900">Добро пожаловать, {user?.name}</h2>
        <p className="text-sm text-neutral-500">
          Фаза 5 готова — оболочка фронтенда с авторизацией
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Что дальше?</CardTitle>
          <CardDescription>Фазы 6–7: реальное время, отчёты, E2E-тесты и деплой</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2 text-sm text-neutral-600">
            <li>• Фаза 6 — страницы товаров и транзакций, SSE, отчёты PDF/XLSX</li>
            <li>• Фаза 7 — Playwright E2E и деплой на Vercel</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
