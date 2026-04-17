'use client'

import { useAuthStore } from '@/lib/auth-store'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@jewelry/ui'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

const ACCESS_CODE = '0507м'

export default function AccessCodePage() {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const accessConfirmed = useAuthStore((s) => s.accessConfirmed)
  const confirmAccess = useAuthStore((s) => s.confirmAccess)
  const [code, setCode] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!token) router.replace('/login')
    if (accessConfirmed) router.replace('/dashboard')
  }, [token, accessConfirmed, router])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (code === ACCESS_CODE) {
      confirmAccess()
      router.replace('/dashboard')
    } else {
      setError(true)
      setCode('')
    }
  }

  if (!token) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Код доступу</CardTitle>
        <CardDescription>Введіть код для підтвердження доступу</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accessCode">Код</Label>
            <Input
              id="accessCode"
              type="password"
              autoFocus
              value={code}
              onChange={(e) => {
                setCode(e.target.value)
                setError(false)
              }}
              placeholder="Введіть код доступу"
            />
          </div>
          {error && <Alert variant="destructive">Невірний код доступу</Alert>}
          <Button type="submit">Підтвердити</Button>
        </form>
      </CardContent>
    </Card>
  )
}
