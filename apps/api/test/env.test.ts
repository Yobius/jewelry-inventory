import { describe, expect, it } from 'vitest'
import { parseEnv } from '../src/env'

describe('parseEnv', () => {
  it('parses a valid env object', () => {
    const env = parseEnv({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      JWT_SECRET: 'secret-that-is-long-enough-32chars',
      API_PORT: '4000',
    })
    expect(env.API_PORT).toBe(4000)
    expect(env.JWT_SECRET).toBe('secret-that-is-long-enough-32chars')
  })

  it('rejects short JWT_SECRET', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
        JWT_SECRET: 'short',
        API_PORT: '4000',
      }),
    ).toThrow(/JWT_SECRET/)
  })

  it('defaults API_PORT when missing', () => {
    const env = parseEnv({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      JWT_SECRET: 'secret-that-is-long-enough-32chars',
    })
    expect(env.API_PORT).toBe(4000)
  })
})
