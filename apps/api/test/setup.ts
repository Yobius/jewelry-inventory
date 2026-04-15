import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Load .env from repo root into process.env before tests start.
 * Done manually (no `dotenv` dep) — we only need a handful of keys.
 */
const envPath = resolve(__dirname, '../../../.env')
try {
  const raw = readFileSync(envPath, 'utf-8')
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
} catch {
  // .env missing is fine for non-integration tests
}
