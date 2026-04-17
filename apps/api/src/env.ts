import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  // LiqPay / PrivatBank terminal — optional. When any is missing, /api/payments/liqpay/*
  // endpoints respond 503 "not configured" and POS still works for CASH/CARD.
  LIQPAY_PUBLIC_KEY: z.string().optional(),
  LIQPAY_PRIVATE_KEY: z.string().optional(),
  // Public origin used in result_url / server_url for LiqPay callbacks.
  // Defaults to https://cosmondshop.duckdns.org.
  PUBLIC_ORIGIN: z.string().url().default('https://cosmondshop.duckdns.org'),
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
