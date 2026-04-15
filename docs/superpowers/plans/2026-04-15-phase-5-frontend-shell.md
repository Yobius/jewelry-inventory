# Phase 5 — Frontend Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working Next.js 15 frontend shell (`apps/web`) with auth pages (`/login`, `/register`) and a protected dashboard, talking to `@jewelry/api` over JWT-authenticated HTTP, using Tailwind v4, a small shared `@jewelry/ui` primitives package, TanStack Query, and a Zustand auth store.

**Architecture:**
- `apps/web` — Next.js 15 App Router, React 19, Tailwind v4 via `@tailwindcss/postcss`, no SSR-specific data fetching in this phase (client-side only to keep auth token handling simple).
- `packages/ui` — shared UI primitives (shadcn-style) consumed by web: `Button`, `Input`, `Label`, `Card`, `Alert`. Lives as a source-only workspace package imported via `@jewelry/ui`, transpiled by Next through `transpilePackages`.
- Auth flow: unauthenticated users hit `/login`, submit form → POST `/auth/login` → token stored in Zustand with `localStorage` persist → `QueryClient` default header reads the token → protected layout redirects to `/login` if the store has no token.
- All forms use `react-hook-form` + Zod (same schemas as the API where reasonable).

**Tech Stack:** Next.js 15.x (App Router), React 19, Tailwind v4, `@tailwindcss/postcss`, TanStack Query v5, Zustand 5, react-hook-form 7, `@hookform/resolvers/zod`, `lucide-react`, `clsx` + `tailwind-merge` (via `cn()` util), `class-variance-authority`.

---

## Scope Note

This plan delivers the **shell only** — login, register, logout, a protected dashboard that renders "Welcome, {user.name}" plus a minimal sidebar scaffold. Items/Inventory/Transactions screens are **out of scope** for this phase and belong to Phase 6. Anything that would need an `/api/items` list call should be a stub, not a real integration.

## File Structure

```
apps/web/
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── next-env.d.ts
├── src/
│   ├── app/
│   │   ├── layout.tsx            # root layout with <Providers />
│   │   ├── page.tsx              # redirects to /login or /dashboard
│   │   ├── globals.css           # @import "tailwindcss"
│   │   ├── providers.tsx         # QueryClientProvider + Toaster-ish
│   │   ├── (auth)/
│   │   │   ├── layout.tsx        # centered auth shell
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   └── dashboard/
│   │       ├── layout.tsx        # protected layout + sidebar
│   │       └── page.tsx          # welcome screen
│   └── lib/
│       ├── api-client.ts         # fetch wrapper with token + error shape
│       ├── auth-store.ts         # zustand + persist
│       ├── query-client.ts       # singleton factory
│       └── cn.ts                 # clsx + tailwind-merge helper

packages/ui/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts                  # barrel
    ├── cn.ts
    ├── button.tsx
    ├── input.tsx
    ├── label.tsx
    ├── card.tsx
    └── alert.tsx
```

---

### Task 5.1: `@jewelry/ui` package skeleton

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/cn.ts`
- Create: `packages/ui/src/index.ts`

- [ ] **Step 1: `packages/ui/package.json`**

```json
{
  "name": "@jewelry/ui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./cn": "./src/cn.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "dependencies": {
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.5"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "typescript": "^5.6.3"
  }
}
```

- [ ] **Step 2: `packages/ui/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "types": ["react", "react-dom"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

- [ ] **Step 3: `packages/ui/src/cn.ts`**

```ts
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 4: `packages/ui/src/index.ts`** (stub — will grow in Task 5.2)

```ts
export { cn } from './cn.js'
```

- [ ] **Step 5: Install**

Run: `pnpm install`

- [ ] **Step 6: Commit**

```bash
git add packages/ui pnpm-lock.yaml
git commit -m "feat(ui): scaffold @jewelry/ui package"
```

---

### Task 5.2: Core UI primitives (Button, Input, Label, Card, Alert)

**Files:**
- Create: `packages/ui/src/button.tsx`
- Create: `packages/ui/src/input.tsx`
- Create: `packages/ui/src/label.tsx`
- Create: `packages/ui/src/card.tsx`
- Create: `packages/ui/src/alert.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: `packages/ui/src/button.tsx`**

```tsx
import { type VariantProps, cva } from 'class-variance-authority'
import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from './cn.js'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-neutral-900 text-neutral-50 hover:bg-neutral-800 focus-visible:ring-neutral-900',
        outline:
          'border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50 focus-visible:ring-neutral-400',
        ghost: 'text-neutral-900 hover:bg-neutral-100 focus-visible:ring-neutral-400',
        destructive: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3',
        lg: 'h-11 px-6',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
)
Button.displayName = 'Button'
```

- [ ] **Step 2: `packages/ui/src/input.tsx`**

```tsx
import { type InputHTMLAttributes, forwardRef } from 'react'
import { cn } from './cn.js'

export type InputProps = InputHTMLAttributes<HTMLInputElement>

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'flex h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
))
Input.displayName = 'Input'
```

- [ ] **Step 3: `packages/ui/src/label.tsx`**

```tsx
import { type LabelHTMLAttributes, forwardRef } from 'react'
import { cn } from './cn.js'

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement>

export const Label = forwardRef<HTMLLabelElement, LabelProps>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn('text-sm font-medium text-neutral-900', className)}
    {...props}
  />
))
Label.displayName = 'Label'
```

- [ ] **Step 4: `packages/ui/src/card.tsx`**

```tsx
import { type HTMLAttributes, forwardRef } from 'react'
import { cn } from './cn.js'

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-lg border border-neutral-200 bg-white shadow-sm', className)}
      {...props}
    />
  ),
)
Card.displayName = 'Card'

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1.5 p-6', className)} {...props} />
  ),
)
CardHeader.displayName = 'CardHeader'

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2 ref={ref} className={cn('text-xl font-semibold text-neutral-900', className)} {...props} />
  ),
)
CardTitle.displayName = 'CardTitle'

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-neutral-500', className)} {...props} />
  ),
)
CardDescription.displayName = 'CardDescription'

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  ),
)
CardContent.displayName = 'CardContent'

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  ),
)
CardFooter.displayName = 'CardFooter'
```

- [ ] **Step 5: `packages/ui/src/alert.tsx`**

```tsx
import { type HTMLAttributes, forwardRef } from 'react'
import { cn } from './cn.js'

export type AlertProps = HTMLAttributes<HTMLDivElement> & {
  variant?: 'default' | 'destructive'
}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn(
        'rounded-md border px-4 py-3 text-sm',
        variant === 'default' && 'border-neutral-200 bg-neutral-50 text-neutral-900',
        variant === 'destructive' && 'border-red-300 bg-red-50 text-red-900',
        className,
      )}
      {...props}
    />
  ),
)
Alert.displayName = 'Alert'
```

- [ ] **Step 6: Update `packages/ui/src/index.ts`**

```ts
export { cn } from './cn.js'
export { Button, type ButtonProps } from './button.js'
export { Input, type InputProps } from './input.js'
export { Label, type LabelProps } from './label.js'
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './card.js'
export { Alert, type AlertProps } from './alert.js'
```

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @jewelry/ui typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src
git commit -m "feat(ui): button, input, label, card, alert primitives"
```

---

### Task 5.3: `apps/web` Next.js 15 scaffold

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/next-env.d.ts`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/globals.css`

- [ ] **Step 1: `apps/web/package.json`**

```json
{
  "name": "@jewelry/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start",
    "lint": "biome check .",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@hookform/resolvers": "^3.9.1",
    "@jewelry/ui": "workspace:*",
    "@tanstack/react-query": "^5.62.0",
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-hook-form": "^7.54.0",
    "zod": "^3.23.8",
    "zustand": "^5.0.2"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.0.0",
    "@types/node": "^22.9.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.6.3"
  }
}
```

- [ ] **Step 2: `apps/web/tsconfig.json`**

Note: Next.js needs `jsx: preserve`, `moduleResolution: bundler`, and its own `.next/types` include. We don't extend `tsconfig.base.json` 1:1 because Next owns the compiler options; we mirror the strictness flags manually.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", ".next"]
}
```

- [ ] **Step 3: `apps/web/next.config.ts`**

```ts
import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@jewelry/ui'],
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  },
}

export default config
```

- [ ] **Step 4: `apps/web/postcss.config.mjs`**

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
```

- [ ] **Step 5: `apps/web/next-env.d.ts`**

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 6: `apps/web/src/app/globals.css`**

Tailwind v4 ships all utilities behind a single `@import`. Custom theme tokens go inside `@theme`.

```css
@import 'tailwindcss';

@theme {
  --font-sans:
    ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    'Helvetica Neue', Arial, sans-serif;
}

html,
body {
  height: 100%;
  background-color: #f5f5f5;
}

body {
  font-family: var(--font-sans);
  color: #0a0a0a;
}
```

- [ ] **Step 7: `apps/web/src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Providers } from './providers.js'
import './globals.css'

export const metadata: Metadata = {
  title: 'Jewelry Inventory',
  description: 'Jewelry warehouse inventory management',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

- [ ] **Step 8: `apps/web/src/app/page.tsx`** (client-side redirect to `/login` or `/dashboard` based on store state)

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAuthStore } from '@/lib/auth-store.js'

export default function HomePage() {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    router.replace(token ? '/dashboard' : '/login')
  }, [router, token])

  return null
}
```

(At this step `auth-store` doesn't yet exist — this page will fail typecheck until Task 5.5 lands. That's fine: we don't typecheck between tasks, only at the end of the task group.)

- [ ] **Step 9: Install**

Run: `pnpm install`

- [ ] **Step 10: Commit (WIP)**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): scaffold Next.js 15 app with Tailwind v4"
```

---

### Task 5.4: Providers, query client, `cn` util

**Files:**
- Create: `apps/web/src/lib/cn.ts`
- Create: `apps/web/src/lib/query-client.ts`
- Create: `apps/web/src/app/providers.tsx`

- [ ] **Step 1: `apps/web/src/lib/cn.ts`**

```ts
export { cn } from '@jewelry/ui/cn'
```

- [ ] **Step 2: `apps/web/src/lib/query-client.ts`**

```ts
import { QueryClient } from '@tanstack/react-query'

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  })
}
```

- [ ] **Step 3: `apps/web/src/app/providers.tsx`**

```tsx
'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { makeQueryClient } from '@/lib/query-client.js'

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => makeQueryClient())
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
```

- [ ] **Step 4: Commit (WIP)**

```bash
git add apps/web/src/lib/cn.ts apps/web/src/lib/query-client.ts apps/web/src/app/providers.tsx
git commit -m "feat(web): query client provider and cn util"
```

---

### Task 5.5: Zustand auth store with localStorage persist

**Files:**
- Create: `apps/web/src/lib/auth-store.ts`

- [ ] **Step 1: `apps/web/src/lib/auth-store.ts`**

```ts
'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AuthUser = {
  id: string
  email: string
  name: string
  role: 'ADMIN' | 'MANAGER' | 'SELLER' | 'CASHIER' | 'AUDITOR'
}

type AuthState = {
  token: string | null
  user: AuthUser | null
  setSession: (session: { token: string; user: AuthUser }) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: ({ token, user }) => set({ token, user }),
      clear: () => set({ token: null, user: null }),
    }),
    {
      name: 'jewelry-auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
)
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/auth-store.ts
git commit -m "feat(web): zustand auth store with localStorage persist"
```

---

### Task 5.6: API client (fetch wrapper)

**Files:**
- Create: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: `apps/web/src/lib/api-client.ts`**

```ts
import { useAuthStore } from './auth-store.js'

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message)
  }
}

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  auth?: boolean
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth) {
    const token = useAuthStore.getState().token
    if (token) headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  const payload = text.length > 0 ? (JSON.parse(text) as unknown) : null

  if (!res.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed (${res.status})`
    throw new ApiError(message, res.status, payload)
  }

  return payload as T
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/api-client.ts
git commit -m "feat(web): typed fetch wrapper with JWT header"
```

---

### Task 5.7: Auth layout + `/login` page

**Files:**
- Create: `apps/web/src/app/(auth)/layout.tsx`
- Create: `apps/web/src/app/(auth)/login/page.tsx`

- [ ] **Step 1: `apps/web/src/app/(auth)/layout.tsx`**

```tsx
import type { ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 p-6">
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}
```

- [ ] **Step 2: `apps/web/src/app/(auth)/login/page.tsx`**

```tsx
'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
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
import { ApiError, apiRequest } from '@/lib/api-client.js'
import { type AuthUser, useAuthStore } from '@/lib/auth-store.js'

const loginFormSchema = z.object({
  email: z.string().email('Введите корректный email'),
  password: z.string().min(1, 'Пароль обязателен'),
})
type LoginForm = z.infer<typeof loginFormSchema>
type LoginResponse = { user: AuthUser; token: string }

export default function LoginPage() {
  const router = useRouter()
  const setSession = useAuthStore((s) => s.setSession)

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  })

  const mutation = useMutation<LoginResponse, ApiError, LoginForm>({
    mutationFn: (values) =>
      apiRequest<LoginResponse>('/auth/login', {
        method: 'POST',
        body: values,
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
        <CardTitle>Вход в систему</CardTitle>
        <CardDescription>Войдите, чтобы управлять складом</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          className="flex flex-col gap-4"
        >
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
              <p className="text-sm text-red-600">{form.formState.errors.email.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Пароль</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...form.register('password')}
              disabled={mutation.isPending}
            />
            {form.formState.errors.password && (
              <p className="text-sm text-red-600">{form.formState.errors.password.message}</p>
            )}
          </div>
          {mutation.error && <Alert variant="destructive">{mutation.error.message}</Alert>}
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Входим…' : 'Войти'}
          </Button>
          <p className="text-center text-sm text-neutral-600">
            Нет аккаунта?{' '}
            <Link href="/register" className="font-medium text-neutral-900 underline">
              Зарегистрироваться
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(auth)"
git commit -m "feat(web): auth layout and login page"
```

---

### Task 5.8: `/register` page

**Files:**
- Create: `apps/web/src/app/(auth)/register/page.tsx`

- [ ] **Step 1: `apps/web/src/app/(auth)/register/page.tsx`**

```tsx
'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
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
import { ApiError, apiRequest } from '@/lib/api-client.js'
import { type AuthUser, useAuthStore } from '@/lib/auth-store.js'

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
              <p className="text-sm text-red-600">{form.formState.errors.name.message}</p>
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
              <p className="text-sm text-red-600">{form.formState.errors.email.message}</p>
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
              <p className="text-sm text-red-600">{form.formState.errors.password.message}</p>
            )}
          </div>
          {mutation.error && <Alert variant="destructive">{mutation.error.message}</Alert>}
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Создаём аккаунт…' : 'Зарегистрироваться'}
          </Button>
          <p className="text-center text-sm text-neutral-600">
            Уже есть аккаунт?{' '}
            <Link href="/login" className="font-medium text-neutral-900 underline">
              Войти
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web/src/app/(auth)/register"
git commit -m "feat(web): register page"
```

---

### Task 5.9: Protected dashboard layout + welcome screen

**Files:**
- Create: `apps/web/src/app/dashboard/layout.tsx`
- Create: `apps/web/src/app/dashboard/page.tsx`

- [ ] **Step 1: `apps/web/src/app/dashboard/layout.tsx`**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { type ReactNode, useEffect } from 'react'
import { Button } from '@jewelry/ui'
import { useAuthStore } from '@/lib/auth-store.js'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const clear = useAuthStore((s) => s.clear)

  useEffect(() => {
    if (!token) router.replace('/login')
  }, [router, token])

  if (!token) return null

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r border-neutral-200 bg-white p-6">
        <h1 className="mb-8 text-lg font-semibold text-neutral-900">Jewelry Inventory</h1>
        <nav className="flex flex-col gap-2 text-sm">
          <span className="rounded-md bg-neutral-100 px-3 py-2 font-medium text-neutral-900">
            Обзор
          </span>
          <span className="px-3 py-2 text-neutral-500">Товары (Phase 6)</span>
          <span className="px-3 py-2 text-neutral-500">Транзакции (Phase 6)</span>
          <span className="px-3 py-2 text-neutral-500">Отчёты (Phase 6)</span>
        </nav>
        <div className="mt-8 border-t border-neutral-200 pt-6">
          <p className="text-sm font-medium text-neutral-900">{user?.name}</p>
          <p className="text-xs text-neutral-500">{user?.email}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            onClick={() => {
              clear()
              router.replace('/login')
            }}
          >
            Выйти
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: `apps/web/src/app/dashboard/page.tsx`**

```tsx
'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@jewelry/ui'
import { useAuthStore } from '@/lib/auth-store.js'

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-neutral-900">Добро пожаловать, {user?.name}</h2>
        <p className="text-sm text-neutral-500">Фаза 5 готова — оболочка фронтенда с авторизацией</p>
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
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard
git commit -m "feat(web): protected dashboard layout and welcome screen"
```

---

### Task 5.10: Verification — typecheck, lint, dev smoke, commit

- [ ] **Step 1: Typecheck everything**

Run: `pnpm typecheck`
Expected: 0 errors across `@jewelry/db`, `@jewelry/types`, `@jewelry/ui`, `@jewelry/api`, `@jewelry/web`.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: 0 errors. Fix with `pnpm lint:fix` if auto-fixable issues appear (organizeImports, formatting).

- [ ] **Step 3: Dev smoke**

Run API in one terminal: `pnpm --filter @jewelry/api dev` (blocks).
Run web in another: `pnpm --filter @jewelry/web dev` (blocks).
Navigate to `http://localhost:3000`:
- Expect redirect to `/login`.
- Register a new account at `/register` → should redirect to `/dashboard` and render "Добро пожаловать, {name}".
- Reload the dashboard → should stay on `/dashboard` (token persisted).
- Click "Выйти" → redirects to `/login` and localStorage is cleared.

- [ ] **Step 4: Final commit if anything was touched during verification**

```bash
git status
# if clean: Phase 5 is done
# otherwise: commit the fix
```

---

## Self-Review Notes

- **Spec coverage:** Every item from the master plan Phase 5 intent is implemented — Next.js 15 skeleton ✅, Tailwind v4 ✅, shadcn-style primitives ✅ (simplified to 5 components to avoid bloat), auth pages ✅, dashboard shell ✅, TanStack Query provider ✅, Zustand store for UI state ✅, API client ✅.
- **Types consistency:** `AuthUser` and the `setSession` shape are defined once in `auth-store.ts` and reused across login/register responses. `ApiError` is exported once. `cn` is exported once from `@jewelry/ui/cn` and re-exported from the web app for convenience.
- **No placeholders:** Every code block is real, every command is copy-pasteable.
- **Known deferred:**
  - No NextAuth v5 — for this phase we use a plain JWT + Zustand store, which is simpler and sufficient. NextAuth can be swapped in Phase 6 if session management becomes more complex (e.g., refresh tokens).
  - No server-side rendering for data — all queries are client-side for now.
  - No shadcn CLI — we write the primitives by hand because shadcn's CLI targets Tailwind v3 configs. Our primitives mirror shadcn's API shape so a swap is trivial later.
  - No toast library — Alert on errors is enough for this phase.
