# @jewelry/db

Shared Prisma schema and client for the jewelry inventory system.

## Setup

1. Copy `.env.example` to `.env` at the repo root and set `DATABASE_URL` to your PostgreSQL instance (Neon, Supabase, or local Postgres).
2. Run `pnpm db:generate` to generate the Prisma client.
3. Run `pnpm db:migrate` to apply the initial migration.

## Usage

```ts
import { prisma } from '@jewelry/db'

const users = await prisma.user.findMany()
```

## JSON columns

JSON columns (`User.location`, `Item.specs`, `Item.pricing`, `Item.identification`, `Inventory.quantities`, `Transaction.movement`) are typed through the `@jewelry/types` package.
