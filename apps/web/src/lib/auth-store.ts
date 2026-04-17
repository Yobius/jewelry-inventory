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
  accessConfirmed: boolean
  setSession: (session: { token: string; user: AuthUser }) => void
  confirmAccess: () => void
  clear: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      accessConfirmed: false,
      setSession: ({ token, user }) => set({ token, user, accessConfirmed: false }),
      confirmAccess: () => set({ accessConfirmed: true }),
      clear: () => set({ token: null, user: null, accessConfirmed: false }),
    }),
    {
      name: 'jewelry-auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
)
