import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app'

describe('GET /health', () => {
  it('returns ok', async () => {
    const app = createApp({ jwtSecret: 'test-secret-that-is-long-enough-32chars', quiet: true })
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ status: 'ok' })
  })
})
