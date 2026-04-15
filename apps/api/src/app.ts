import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { createAuthRoute } from './routes/auth.js'
import { createEventsRoute } from './routes/events.js'
import { healthRoute } from './routes/health.js'
import { createInventoryRoute } from './routes/inventory.js'
import { createItemsRoute } from './routes/items.js'
import { createReportsRoute } from './routes/reports.js'
import { createTransactionsRoute } from './routes/transactions.js'

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
  app.route('/api/items', createItemsRoute(opts.jwtSecret))
  app.route('/api/inventory', createInventoryRoute(opts.jwtSecret))
  app.route('/api/transactions', createTransactionsRoute(opts.jwtSecret))
  app.route('/api/reports', createReportsRoute(opts.jwtSecret))
  app.route('/api/events', createEventsRoute(opts.jwtSecret))
  return app
}
