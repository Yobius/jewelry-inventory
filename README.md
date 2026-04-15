# Jewelry Inventory System

Production-ready jewelry warehouse inventory management on the 2026 stack.

## Stack

- **Monorepo**: pnpm workspaces + Turbo
- **Backend**: Hono (Node.js) + Prisma 5 + PostgreSQL 16
- **Frontend (Phase 5)**: Next.js 15 + React 19 + Tailwind v4 + shadcn/ui
- **Validation**: Zod
- **Auth**: JWT (jose) + argon2id password hashing
- **Tests**: Vitest + Playwright (Phase 7)
- **Lint/format**: Biome
- **TypeScript**: 5.x

## Layout

```
jewelry-inventory/
├── apps/
│   ├── api/                    # Hono backend (Phase 3 — shipped)
│   └── web/                    # Next.js frontend (Phase 5 — TBD)
├── packages/
│   ├── db/                     # Prisma schema + client (@jewelry/db)
│   ├── types/                  # Shared JSON payload types (@jewelry/types)
│   ├── ui/                     # Shared UI components (Phase 5 — TBD)
│   └── utils/                  # Shared utilities (Phase 5 — TBD)
└── docs/superpowers/plans/     # Implementation plans
```

## Getting started

```bash
# 1. Install
pnpm install

# 2. Env
cp .env.example .env
# edit DATABASE_URL to point at your Postgres

# 3. Generate Prisma client
pnpm db:generate

# 4. Apply migrations (once DATABASE_URL is real)
pnpm db:migrate

# 5. Dev
pnpm --filter @jewelry/api dev   # API on :4000
```

## Common commands

| Command | Purpose |
|---|---|
| `pnpm test` | Run all package tests (Vitest) |
| `pnpm typecheck` | TS typecheck across workspace |
| `pnpm lint` | Biome lint |
| `pnpm lint:fix` | Biome auto-fix |
| `pnpm build` | Build all packages |
| `pnpm db:generate` | Regenerate Prisma client |
| `pnpm db:migrate` | Prisma migrate dev |
| `pnpm db:studio` | Open Prisma Studio |

## Status

| Phase | Scope | Status |
|---|---|---|
| 1 | Monorepo foundation (pnpm, Turbo, Biome, TS) | ✅ Done |
| 2 | `@jewelry/db` (Prisma schema) + `@jewelry/types` | ✅ Done |
| 3 | `@jewelry/api` skeleton — env validation, password, JWT, Hono app, `/health` | ✅ Done |
| 4 | Items & Inventory domain (CRUD, audit, history) | 🔜 Next |
| 5 | Next.js frontend shell + auth pages | ⏳ |
| 6 | SSE real-time + transactions + reports | ⏳ |
| 7 | Playwright E2E + Vercel deploy | ⏳ |

Master plan: [`docs/superpowers/plans/2026-04-15-jewelry-inventory-master-plan.md`](docs/superpowers/plans/2026-04-15-jewelry-inventory-master-plan.md).

## Architecture notes

- **JSON columns**: `User.location`, `Item.specs`, `Item.pricing`, `Item.identification`, `Inventory.quantities`, `Transaction.movement`, and audit `before/after` are Prisma `Json` fields. Their TypeScript shapes live in [`packages/types`](packages/types/src/index.ts). The spec used Prisma MongoDB-style `type` blocks — those are not valid on PostgreSQL in Prisma 5, so JSON + shared TS types is the idiomatic replacement.
- **TS module resolution**: dev/typecheck uses `Bundler` resolution (no `.js` extensions needed). The API build (`tsconfig.build.json`) uses `NodeNext` for real runtime output, so source imports in `apps/api/src/**` explicitly suffix `.js`.
- **Prisma `onlyBuiltDependencies`**: the root `package.json` pre-approves `@prisma/client`, `@prisma/engines`, `prisma`, `argon2`, `esbuild`, and `@biomejs/biome` so `pnpm install` runs their native post-install scripts without prompting.
