export type DomainEvent =
  | { type: 'item.created'; itemId: string }
  | { type: 'item.updated'; itemId: string }
  | { type: 'inventory.adjusted'; itemId: string }
  | {
      type: 'transaction.created'
      transactionId: string
      itemId: string
      kind: 'IN' | 'OUT' | 'MOVE' | 'ADJUSTMENT'
    }
  | { type: 'import.completed'; importId: string }

type Subscriber = (event: DomainEvent) => void

const subscribers = new Set<Subscriber>()

export function subscribe(fn: Subscriber): () => void {
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}

export function emit(event: DomainEvent): void {
  for (const fn of subscribers) {
    try {
      fn(event)
    } catch {
      // a broken subscriber must not block siblings
    }
  }
}

/** Test helper — clears any lingering subscribers. Never call in prod code paths. */
export function __resetSubscribers(): void {
  subscribers.clear()
}
