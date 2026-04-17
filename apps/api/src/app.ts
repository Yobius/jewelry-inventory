import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { Env } from './env.js'
import { createAuthRoute } from './routes/auth.js'
import { createEventsRoute } from './routes/events.js'
import { healthRoute } from './routes/health.js'
import { createImportsRoute } from './routes/imports.js'
import { createInventoryRoute } from './routes/inventory.js'
import { createItemsRoute } from './routes/items.js'
import { createLabelsRoute } from './routes/labels.js'
import { createManufacturersRoute } from './routes/manufacturers.js'
import { createPaymentsRoute } from './routes/payments.js'
import { createReportsRoute } from './routes/reports.js'
import { createStatsRoute } from './routes/stats.js'
import { createStonesRoute } from './routes/stones.js'
import { createSuppliersRoute } from './routes/suppliers.js'
import { createTransactionsRoute } from './routes/transactions.js'
import { createUsersRoute } from './routes/users.js'

export type AppOptions = {
  jwtSecret: string
  /** Full parsed env — required for the payments route (LiqPay keys, public origin). */
  env?: Env
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
  app.route('/api/manufacturers', createManufacturersRoute(opts.jwtSecret))
  app.route('/api/suppliers', createSuppliersRoute(opts.jwtSecret))
  app.route('/api/stones', createStonesRoute(opts.jwtSecret))
  app.route('/api/imports', createImportsRoute(opts.jwtSecret))
  app.route('/api/labels', createLabelsRoute(opts.jwtSecret))
  app.route('/api/stats', createStatsRoute(opts.jwtSecret))
  app.route('/api/users', createUsersRoute(opts.jwtSecret))
  if (opts.env) {
    app.route('/api/payments', createPaymentsRoute(opts.env, opts.jwtSecret))
  }
  return app
}
