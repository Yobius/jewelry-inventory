import type { ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 p-6 dark:bg-neutral-950">
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}
