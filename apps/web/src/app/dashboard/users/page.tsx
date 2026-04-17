'use client'

import { apiRequest } from '@/lib/api-client'
import { useAuthStore } from '@/lib/auth-store'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@jewelry/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

type Role = 'ADMIN' | 'MANAGER' | 'SELLER' | 'CASHIER' | 'AUDITOR'

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Адмін (повний доступ)',
  MANAGER: 'Менеджер (товари, ціни, імпорт)',
  SELLER: 'Продавець (каса, перегляд)',
  CASHIER: 'Касир (тільки каса)',
  AUDITOR: 'Ревізор (тільки звіти)',
}

type ManagedUser = {
  id: string
  email: string
  name: string
  role: Role
  createdAt: string
  updatedAt: string
  _count: { transactions: number; items: number }
}
type UsersList = { users: ManagedUser[] }

export default function UsersPage() {
  const router = useRouter()
  const currentUser = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [resetFor, setResetFor] = useState<ManagedUser | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (currentUser && currentUser.role !== 'ADMIN') {
      router.replace('/dashboard')
    }
  }, [currentUser, router])

  const users = useQuery<UsersList>({
    queryKey: ['users'],
    queryFn: () => apiRequest<UsersList>('/api/users'),
    enabled: currentUser?.role === 'ADMIN',
  })

  const updateRole = useMutation<
    unknown,
    Error,
    { id: string; role: Role; name?: string }
  >({
    mutationFn: (payload) =>
      apiRequest(`/api/users/${payload.id}`, {
        method: 'PATCH',
        body: { role: payload.role, name: payload.name },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setNotice('✓ Оновлено')
      setTimeout(() => setNotice(null), 2500)
    },
  })

  const deleteUser = useMutation<unknown, Error, string>({
    mutationFn: (id) => apiRequest(`/api/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setNotice('✓ Видалено')
      setTimeout(() => setNotice(null), 2500)
    },
  })

  if (currentUser && currentUser.role !== 'ADMIN') {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          Користувачі
        </h2>
        <Alert variant="destructive">
          Доступ тільки для ADMIN. Твоя роль: {currentUser.role}.
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            Користувачі
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Ролі, пароль, створення нових акаунтів
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>+ Новий користувач</Button>
      </div>

      {notice && <Alert>{notice}</Alert>}
      {updateRole.error && <Alert variant="destructive">{updateRole.error.message}</Alert>}
      {deleteUser.error && <Alert variant="destructive">{deleteUser.error.message}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>Усі акаунти ({users.data?.users.length ?? 0})</CardTitle>
          <CardDescription>Клік на роль щоб змінити</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Ім'я</TableHead>
                <TableHead>Роль</TableHead>
                <TableHead className="text-right">Чеків / Товарів</TableHead>
                <TableHead>Створено</TableHead>
                <TableHead className="w-48" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-neutral-500 dark:text-neutral-400">
                    Завантаження…
                  </TableCell>
                </TableRow>
              )}
              {users.data?.users.map((u) => {
                const isSelf = u.id === currentUser?.id
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-mono text-xs">{u.email}</div>
                      {isSelf && (
                        <div className="text-xs text-blue-600 dark:text-blue-400">ти</div>
                      )}
                    </TableCell>
                    <TableCell>{u.name}</TableCell>
                    <TableCell>
                      <Select
                        value={u.role}
                        onChange={(e) =>
                          updateRole.mutate({ id: u.id, role: e.target.value as Role })
                        }
                        disabled={updateRole.isPending}
                        className="max-w-xs"
                      >
                        {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {u._count.transactions} / {u._count.items}
                    </TableCell>
                    <TableCell className="text-xs text-neutral-500">
                      {new Date(u.createdAt).toLocaleDateString('uk-UA')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setResetFor(u)}>
                          Пароль
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Видалити користувача ${u.email}? Цю дію не можна скасувати.`,
                              )
                            ) {
                              deleteUser.mutate(u.id)
                            }
                          }}
                          disabled={isSelf || deleteUser.isPending}
                        >
                          ✕
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ['users'] })
          setNotice('✓ Створено')
          setTimeout(() => setNotice(null), 2500)
        }}
      />
      <ResetPasswordDialog
        user={resetFor}
        onClose={() => setResetFor(null)}
        onDone={() => {
          setNotice('✓ Пароль оновлено')
          setTimeout(() => setNotice(null), 2500)
        }}
      />
    </div>
  )
}

function CreateUserDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: () => void
}) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('SELLER')

  const mutation = useMutation<unknown, Error, void>({
    mutationFn: () =>
      apiRequest('/api/users', {
        method: 'POST',
        body: { email, name, password, role },
      }),
    onSuccess: () => {
      onCreated()
      onOpenChange(false)
      setEmail('')
      setName('')
      setPassword('')
      setRole('SELLER')
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Новий користувач</DialogTitle>
        <DialogDescription>Створити акаунт для продавця, касира тощо</DialogDescription>
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-email">Email</Label>
          <Input
            id="new-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-name">Ім'я</Label>
          <Input
            id="new-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-password">Пароль (8+ символів)</Label>
          <Input
            id="new-password"
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-role">Роль</Label>
          <Select
            id="new-role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </div>
        {mutation.error && <Alert variant="destructive">{mutation.error.message}</Alert>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Скасувати
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Створюємо…' : 'Створити'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}

function ResetPasswordDialog({
  user,
  onClose,
  onDone,
}: {
  user: ManagedUser | null
  onClose: () => void
  onDone: () => void
}) {
  const [password, setPassword] = useState('')

  const mutation = useMutation<unknown, Error, void>({
    mutationFn: () => {
      if (!user) throw new Error('no user')
      return apiRequest(`/api/users/${user.id}/reset-password`, {
        method: 'POST',
        body: { password },
      })
    },
    onSuccess: () => {
      onDone()
      onClose()
      setPassword('')
    },
  })

  return (
    <Dialog open={user !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogHeader>
        <DialogTitle>Новий пароль</DialogTitle>
        <DialogDescription>
          Для {user?.email}. Старий пароль буде перезаписано.
        </DialogDescription>
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reset-pwd">Пароль (8+ символів)</Label>
          <Input
            id="reset-pwd"
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
          />
        </div>
        {mutation.error && <Alert variant="destructive">{mutation.error.message}</Alert>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Скасувати
          </Button>
          <Button type="submit" disabled={mutation.isPending || password.length < 8}>
            {mutation.isPending ? 'Зберігаємо…' : 'Зберегти'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
