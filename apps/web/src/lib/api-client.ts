import { useAuthStore } from './auth-store'

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message)
  }
}

/**
 * In production nginx proxies `/api`, `/auth`, `/health` on the same origin.
 * In dev we set NEXT_PUBLIC_API_URL to the API port directly (see apps/web/.env).
 * An empty string means "same origin".
 */
export const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? ''

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

  const res = await fetch(`${apiBaseUrl}${path}`, {
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
