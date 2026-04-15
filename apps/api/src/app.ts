import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { healthRoute } from './routes/health.js'

export function createApp() {
  const app = new Hono()
  app.use('*', logger())
  app.use('*', cors())
  app.route('/health', healthRoute)
  return app
}
