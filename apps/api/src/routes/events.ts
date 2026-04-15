import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { type AuthVariables, createAuthMiddleware } from '../lib/auth-middleware.js'
import { type DomainEvent, subscribe } from '../lib/events.js'

export function createEventsRoute(jwtSecret: string) {
  const route = new Hono<{ Variables: AuthVariables }>()
  route.use('*', createAuthMiddleware(jwtSecret))

  route.get('/', (c) =>
    streamSSE(c, async (stream) => {
      let id = 0
      const queue: DomainEvent[] = []
      let notify: (() => void) | null = null

      const unsubscribe = subscribe((event) => {
        queue.push(event)
        if (notify) {
          const n = notify
          notify = null
          n()
        }
      })

      stream.onAbort(() => {
        unsubscribe()
      })

      // Immediate hello so the client knows the stream is open.
      id += 1
      await stream.writeSSE({ id: String(id), event: 'hello', data: '{}' })

      try {
        while (!stream.aborted) {
          if (queue.length === 0) {
            await new Promise<void>((resolve) => {
              notify = resolve
              // Keepalive every 25s so load balancers don't kill idle streams.
              setTimeout(resolve, 25_000)
            })
            if (queue.length === 0 && !stream.aborted) {
              id += 1
              await stream.writeSSE({ id: String(id), event: 'ping', data: '{}' })
              continue
            }
          }
          const next = queue.shift()
          if (!next) continue
          id += 1
          await stream.writeSSE({
            id: String(id),
            event: next.type,
            data: JSON.stringify(next),
          })
        }
      } finally {
        unsubscribe()
      }
    }),
  )

  return route
}
