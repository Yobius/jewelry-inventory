'use client'

import { makeQueryClient } from '@/lib/query-client'
import { ThemeProvider } from '@/lib/theme'
import { QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => makeQueryClient())
  return (
    <ThemeProvider>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ThemeProvider>
  )
}
