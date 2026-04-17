'use client'

import { type ApiError, apiRequest } from '@/lib/api-client'
import { type AuthUser, useAuthStore } from '@/lib/auth-store'
import { zodResolver } from '@hookform/resolvers/zod'
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
import { useMutation } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

const registerFormSchema = z.object({
  name: z.string().min(1, 'Имя обязательно').max(100),
  email: z.string().email('Введите корректный email'),
  password: z.string().min(8, 'Минимум 8 символов').max(128),
})
type RegisterForm = z.infer<typeof registerFormSchema>
type RegisterResponse = { user: AuthUser; token: string }

export default function RegisterPage() {
  const router = useRouter()
  const setSession = useAuthStore((s) => s.setSession)

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { name: '', email: '', password: '' },
  })

  const mutation = useMutation<RegisterResponse, ApiError, RegisterForm>({
    mutationFn: (values) =>
      apiRequest<RegisterResponse>('/auth/register', {
        method: 'POST',
        body: { ...values, role: 'ADMIN' },
        auth: false,
      }),
    onSuccess: (data) => {
      setSession({ token: data.token, user: data.user })
      router.replace('/dashboard')
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Регистрация</CardTitle>
        <CardDescription>Создайте учётную запись администратора</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Имя</Label>
            <Input id="name" {...form.register('name')} disabled={mutation.isPending} />
            {form.formState.errors.name && (
              <p className="text-sm text-red-600 dark:text-red-400">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              {...form.register('email')}
              disabled={mutation.isPending}
            />
            {form.formState.errors.email && (
              <p className="text-sm text-red-600 dark:text-red-400">{form.formState.errors.email.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Пароль</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              {...form.register('password')}
              disabled={mutation.isPending}
            />
            {form.formState.errors.password && (
              <p className="text-sm text-red-600 dark:text-red-400">{form.formState.errors.password.message}</p>
            )}
          </div>
          {mutation.error && <Alert variant="destructive">{mutation.error.message}</Alert>}
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Создаём аккаунт…' : 'Зарегистрироваться'}
          </Button>
          <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
            Уже есть аккаунт?{' '}
            <Link
              href="/login"
              className="font-medium text-neutral-900 underline dark:text-neutral-100"
            >
              Войти
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
