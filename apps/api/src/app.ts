import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { createAuthRoute } from './routes/auth.js'
import { healthRoute } from './routes/health.js'

export type AppOptions = {
  jwtSecret: string
  /** If true, the built-in request logger is suppressed (useful for tests). */
  quiet?: boolean
}

export function createApp(opts: AppOptions): Hono {
  const app = new Hono()
  if (!opts.quiet) {
    app.use('*', logger())
  }
  app.use('*', cors())
  app.route('/health', healthRoute)
  app.route('/auth', createAuthRoute(opts.jwtSecret))
  return app
}
