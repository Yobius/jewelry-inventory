import { describe, expect, it } from 'vitest'
import { createJwt, verifyJwt } from '../src/lib/jwt'

const secret = 'test-secret-that-is-long-enough-32chars!'

describe('jwt', () => {
  it('round-trips a payload', async () => {
    const token = await createJwt({ sub: 'user_123', role: 'SELLER' }, secret)
    const payload = await verifyJwt(token, secret)
    expect(payload.sub).toBe('user_123')
    expect(payload.role).toBe('SELLER')
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await createJwt({ sub: 'user_123', role: 'SELLER' }, secret)
    await expect(verifyJwt(token, 'another-secret-that-is-long-enough-32ch')).rejects.toThrow()
  })
})
