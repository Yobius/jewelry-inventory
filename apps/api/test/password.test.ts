import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../src/lib/password'

describe('password', () => {
  it('hashes and verifies a correct password', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(hash).not.toBe('correct horse battery staple')
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(await verifyPassword(hash, 'wrong')).toBe(false)
  })
})
