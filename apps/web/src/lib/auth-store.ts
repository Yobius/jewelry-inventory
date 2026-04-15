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
