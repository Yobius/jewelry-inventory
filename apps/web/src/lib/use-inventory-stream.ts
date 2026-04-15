'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { apiBaseUrl } from './api-client'
import { useAuthStore } from './auth-store'

/**
 * Subscribes to /api/events (SSE) and invalidates TanStack Query caches on
 * domain events. Native EventSource cannot set headers, so we pass the JWT
 * via `?token=` query param — accepted by our auth middleware on SSE routes.
 */
export function useInventoryStream(): void {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!token) return
    const url = `${apiBaseUrl}/api/events?token=${encodeURIComponent(token)}`
    const es = new EventSource(url)

    const handleItem = () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
    }
    const handleTx = () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
    }

    es.addEventListener('item.created', handleItem)
    es.addEventListener('item.updated', handleItem)
    es.addEventListener('inventory.adjusted', handleItem)
    es.addEventListener('transaction.created', handleTx)
    // swallow errors — browser auto-reconnects
    es.onerror = () => {}

    return () => {
      es.removeEventListener('item.created', handleItem)
      es.removeEventListener('item.updated', handleItem)
      es.removeEventListener('inventory.adjusted', handleItem)
      es.removeEventListener('transaction.created', handleTx)
      es.close()
    }
  }, [token, queryClient])
}
