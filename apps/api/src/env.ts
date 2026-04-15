import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  API_PORT: z.coerce.number().int().positive().default(4000),
})

export type Env = z.infer<typeof envSchema>

export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid environment: ${issues}`)
  }
  return result.data
}
