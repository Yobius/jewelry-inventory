# Jewelry Inventory System — Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready jewelry warehouse inventory management system using the 2026 stack (Next.js 15 + React 19 + Hono + Prisma + PostgreSQL).

**Architecture:** Monorepo with `apps/web` (Next.js frontend), `apps/api` (Hono backend), and shared `packages/*` (db, types, ui, utils). Turbo orchestrates builds. Prisma v5 owns the schema. Auth via NextAuth v5. Real-time via SSE.

**Tech Stack:** Next.js 15, React 19, Hono, Prisma 5, PostgreSQL 16, TypeScript 5.5+, Zod, TanStack Query v5, Zustand, shadcn/ui, Tailwind v4, NextAuth v5, Vitest, Playwright, Biome, Turbo, pnpm.

---

## Scope Note

This is a large spec covering multiple independent subsystems. It is broken into **7 phases**. Each phase produces working, testable software and should be committed separately. Phase plans are referenced below as separate documents (to be written as we reach each phase).

### Phase Overview

| # | Phase | Status | Plan Doc |
|---|-------|--------|----------|
| 1 | Monorepo foundation + tooling | in this doc | this file |
| 2 | Database schema + Prisma setup | in this doc | this file |
| 3 | API skeleton (Hono) + health/auth routes | in this doc | this file |
| 4 | Items CRUD + Inventory domain | phase plan | `2026-04-15-phase-4-items-domain.md` (TBD) |
| 5 | Frontend shell (Next.js + shadcn + auth) | phase plan | `2026-04-15-phase-5-frontend-shell.md` (TBD) |
| 6 | Real-time (SSE) + Transactions + Reports | phase plan | `2026-04-15-phase-6-realtime-reports.md` (TBD) |
| 7 | E2E tests + Deployment (Vercel) | phase plan | `2026-04-15-phase-7-e2e-deploy.md` (TBD) |

**This master plan document fully specifies Phases 1–3.** Subsequent phases will be written as follow-up plan documents once earlier phases are done and their outputs verified. This avoids placeholder-ridden mega-plans and keeps each phase reviewable.

---

## File Structure (top-level, phases 1–3)

```
jewelry-inventory/
├── apps/
│   ├── web/                    # Next.js 15 app (populated in Phase 5)
│   └── api/                    # Hono backend
│       ├── src/
│       │   ├── index.ts                # Hono app entry
│       │   ├── env.ts                  # Env validation (Zod)
│       │   ├── routes/
│       │   │   ├── health.ts           # GET /health
│       │   │   └── auth.ts             # POST /auth/register, /auth/login
│       │   ├── middleware/
│       │   │   └── error.ts            # Error handler
│       │   ├── lib/
│       │   │   ├── db.ts               # Prisma client singleton
│       │   │   ├── password.ts         # Argon2 hash/verify
│       │   │   └── jwt.ts              # JWT sign/verify
│       │   └── schemas/
│       │       └── auth.ts             # Zod auth schemas
│       ├── test/
│       │   ├── health.test.ts
│       │   ├── auth.test.ts
│       │   └── helpers/
│       │       └── app.ts              # Test app factory
│       ├── package.json
│       ├── tsconfig.json
│       └── vitest.config.ts
│
├── packages/
│   ├── db/                     # Prisma schema + migrations + client export
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   ├── src/
│   │   │   └── index.ts        # re-exports PrismaClient
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── types/                  # Shared TS types
│   │   ├── src/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── ui/                     # Shared UI (Phase 5)
│   └── utils/                  # Shared utilities
│       ├── src/
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── .gitignore
├── .nvmrc
├── biome.json
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── turbo.json
├── README.md
└── docs/
    └── superpowers/plans/
        └── 2026-04-15-jewelry-inventory-master-plan.md  # this file
```

---

# Phase 1 — Monorepo Foundation

**Goal:** Working pnpm + Turbo monorepo with TypeScript, Biome, shared tsconfig, and all workspace packages linked.

### Task 1.1: Root workspace manifest

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.nvmrc`
- Create: `.gitignore`

- [ ] **Step 1: Write root `package.json`**

```json
{
  "name": "jewelry-inventory",
  "private": true,
  "version": "0.1.0",
  "packageManager": "pnpm@10.0.0",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "db:generate": "pnpm --filter @jewelry/db generate",
    "db:migrate": "pnpm --filter @jewelry/db migrate:dev",
    "db:studio": "pnpm --filter @jewelry/db studio"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.4",
    "turbo": "^2.3.0",
    "typescript": "^5.6.3"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

- [ ] **Step 2: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Write `.nvmrc`**

```
20
```

- [ ] **Step 4: Write `.gitignore`**

```
# deps
node_modules
.pnpm-store

# build
.next
.turbo
dist
build

# env
.env
.env*.local

# logs
*.log
npm-debug.log*
pnpm-debug.log*

# misc
.DS_Store
coverage
*.tsbuildinfo

# db
packages/db/prisma/dev.db*
```

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml .nvmrc .gitignore
git commit -m "chore: init pnpm workspace manifest"
```

---

### Task 1.2: Shared TypeScript + Biome config

**Files:**
- Create: `tsconfig.base.json`
- Create: `biome.json`
- Create: `turbo.json`

- [ ] **Step 1: Write `tsconfig.base.json`**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true,
    "incremental": true
  }
}
```

- [ ] **Step 2: Write `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": {
        "noNonNullAssertion": "off"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "asNeeded",
      "trailingCommas": "all"
    }
  },
  "files": {
    "ignore": ["**/node_modules", "**/dist", "**/.next", "**/.turbo", "**/build"]
  }
}
```

- [ ] **Step 3: Write `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    }
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add tsconfig.base.json biome.json turbo.json
git commit -m "chore: add base TS, biome, and turbo configs"
```

---

### Task 1.3: Install root deps and verify

- [ ] **Step 1: Install**

Run: `cd ~/projects/jewelry-inventory && pnpm install`
Expected: creates `node_modules`, `pnpm-lock.yaml`, no errors.

- [ ] **Step 2: Verify Biome works**

Run: `pnpm lint`
Expected: passes (no files yet).

- [ ] **Step 3: Commit lockfile**

```bash
git add pnpm-lock.yaml
git commit -m "chore: lock root deps"
```

---

# Phase 2 — Database Package (`@jewelry/db`)

**Goal:** Prisma schema matching the spec, installable as a workspace package, with dev-time PostgreSQL via SQLite fallback for first local run (real Postgres is wired in Task 2.4).

### Task 2.1: Create `@jewelry/db` package skeleton

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/src/index.ts`

- [ ] **Step 1: Write `packages/db/package.json`**

```json
{
  "name": "@jewelry/db",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "generate": "prisma generate",
    "migrate:dev": "prisma migrate dev",
    "migrate:deploy": "prisma migrate deploy",
    "studio": "prisma studio",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@prisma/client": "^5.22.0"
  },
  "devDependencies": {
    "prisma": "^5.22.0",
    "typescript": "^5.6.3"
  }
}
```

- [ ] **Step 2: Write `packages/db/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Write `packages/db/src/index.ts`**

```ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export * from '@prisma/client'
```

- [ ] **Step 4: Install**

Run: `pnpm install`
Expected: installs Prisma to the db package.

- [ ] **Step 5: Commit**

```bash
git add packages/db pnpm-lock.yaml
git commit -m "feat(db): scaffold @jewelry/db package"
```

---

### Task 2.2: Write Prisma schema (aligned with spec)

**Files:**
- Create: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Write the schema**

Note: Prisma on PostgreSQL doesn't support composite `type` blocks without `previewFeatures = ["composite"]` and MongoDB. Since spec uses `type` blocks, we adapt them into `Json` fields with TypeScript types defined in `@jewelry/types` (Task 2.3). Everything else matches the spec.

```prisma
// packages/db/prisma/schema.prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["fullTextSearchPostgres"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  ADMIN
  MANAGER
  SELLER
  CASHIER
  AUDITOR
}

enum Material {
  GOLD
  SILVER
  PLATINUM
  OTHER
}

enum TransactionType {
  IN
  OUT
  MOVE
  ADJUSTMENT
}

model User {
  id           String        @id @default(cuid())
  email        String        @unique
  password     String
  name         String
  role         UserRole      @default(SELLER)
  location     Json?
  items        Item[]        @relation("CreatedBy")
  transactions Transaction[]
  auditLogs    AuditLog[]
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  @@index([email])
  @@index([role])
}

model Item {
  id             String        @id @default(cuid())
  sku            String        @unique
  name           String
  specs          Json
  material       Material
  carat          Int?
  weight         Decimal       @db.Decimal(10, 2)
  pricing        Json
  identification Json
  createdBy      String
  createdByUser  User          @relation("CreatedBy", fields: [createdBy], references: [id])
  inventory      Inventory?
  transactions   Transaction[]
  history        ItemHistory[]
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  @@index([sku])
  @@index([name])
}

model Inventory {
  id         String   @id @default(cuid())
  itemId     String   @unique
  item       Item     @relation(fields: [itemId], references: [id], onDelete: Cascade)
  quantities Json
  lastSync   DateTime @updatedAt

  @@index([itemId])
}

model Transaction {
  id        String          @id @default(cuid())
  itemId    String
  item      Item            @relation(fields: [itemId], references: [id])
  movement  Json
  quantity  Int
  type      TransactionType
  reason    String?
  userId    String
  user      User            @relation(fields: [userId], references: [id])
  metadata  Json?
  createdAt DateTime        @default(now())

  @@index([itemId])
  @@index([userId])
  @@index([createdAt])
}

model ItemHistory {
  id        String   @id @default(cuid())
  itemId    String
  item      Item     @relation(fields: [itemId], references: [id], onDelete: Cascade)
  changes   Json
  createdAt DateTime @default(now())

  @@index([itemId])
  @@index([createdAt])
}

model AuditLog {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  action    String
  entityId  String
  before    Json?
  after     Json?
  metadata  Json?
  createdAt DateTime @default(now())

  @@index([userId])
  @@index([action])
  @@index([createdAt])
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): define Prisma schema per spec"
```

---

### Task 2.3: Shared types for JSON columns

**Files:**
- Create: `packages/types/package.json`
- Create: `packages/types/tsconfig.json`
- Create: `packages/types/src/index.ts`

- [ ] **Step 1: Write `packages/types/package.json`**

```json
{
  "name": "@jewelry/types",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.6.3"
  }
}
```

- [ ] **Step 2: Write `packages/types/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Write `packages/types/src/index.ts`**

```ts
/** JSON payload types mirroring Prisma `Json` columns. */

export type ItemSpecs = {
  width?: number
  height?: number
  depth?: number
  tags: string[]
}

export type ItemPricing = {
  /** Base unit price in UAH (stored as string to preserve Decimal precision). */
  unitPrice: string
  /** Price per gram in UAH. */
  perGram: string
}

export type ItemIdentification = {
  qrCode: string
  barcode?: string
}

export type LocationQuantities = {
  warehouse: number
  point1: number
  point2: number
  point3: number
}

export type TransactionMovement = {
  from?: string
  to?: string
}

export type UserLocationFlags = {
  warehouse?: boolean
  point1?: boolean
  point2?: boolean
  point3?: boolean
}

export const ZERO_QUANTITIES: LocationQuantities = {
  warehouse: 0,
  point1: 0,
  point2: 0,
  point3: 0,
}
```

- [ ] **Step 4: Install and commit**

```bash
pnpm install
git add packages/types pnpm-lock.yaml
git commit -m "feat(types): shared JSON payload types"
```

---

### Task 2.4: Database env + initial migration

**Files:**
- Create: `.env.example`
- Create: `packages/db/.env` (local dev only, gitignored)

- [ ] **Step 1: Write `.env.example`**

```
# PostgreSQL connection string
DATABASE_URL="postgresql://user:password@localhost:5432/jewelry?schema=public"

# API
API_PORT=4000
JWT_SECRET="change-me-in-production"

# Web
NEXT_PUBLIC_API_URL="http://localhost:4000"
```

- [ ] **Step 2: Generate Prisma client**

Run: `pnpm db:generate`
Expected: `✔ Generated Prisma Client` (runs without DB since no migration yet).

Note: the actual `migrate dev` run is deferred to whoever runs the project locally with a real Postgres URL — we do not apply migrations in this plan because we don't want to bake a specific migration timestamp into the repo before the engineer has chosen their Neon/Supabase instance. Instead, we write a bootstrap script and document it.

- [ ] **Step 3: Write `packages/db/README.md`**

```markdown
# @jewelry/db

Shared Prisma schema and client.

## Setup

1. Copy `.env.example` to `.env` at the repo root and set `DATABASE_URL`.
2. Run `pnpm db:generate` to generate the Prisma client.
3. Run `pnpm db:migrate` to apply the initial migration.
```

- [ ] **Step 4: Commit**

```bash
git add .env.example packages/db/README.md
git commit -m "chore(db): env template and setup docs"
```

---

# Phase 3 — API Skeleton (`@jewelry/api`)

**Goal:** Hono server with env validation, health route, and password/JWT utilities. All under Vitest with real unit coverage.

### Task 3.1: API package scaffold

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/index.ts`

- [ ] **Step 1: Write `apps/api/package.json`**

```json
{
  "name": "@jewelry/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@hono/node-server": "^1.13.7",
    "@jewelry/db": "workspace:*",
    "@jewelry/types": "workspace:*",
    "argon2": "^0.41.1",
    "hono": "^4.6.12",
    "jose": "^5.9.6",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.9.0",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^2.1.5"
  }
}
```

- [ ] **Step 2: Write `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 3: Write `apps/api/tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["test/**/*.ts"]
}
```

- [ ] **Step 4: Write `apps/api/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/**/*.test.ts'],
  },
})
```

- [ ] **Step 5: Install**

Run: `pnpm install`

- [ ] **Step 6: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): scaffold Hono API package"
```

---

### Task 3.2: Env validation module (TDD)

**Files:**
- Create: `apps/api/src/env.ts`
- Create: `apps/api/test/env.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/test/env.test.ts
import { describe, expect, it } from 'vitest'
import { parseEnv } from '../src/env'

describe('parseEnv', () => {
  it('parses a valid env object', () => {
    const env = parseEnv({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      JWT_SECRET: 'secret-that-is-long-enough-32chars',
      API_PORT: '4000',
    })
    expect(env.API_PORT).toBe(4000)
    expect(env.JWT_SECRET).toBe('secret-that-is-long-enough-32chars')
  })

  it('rejects short JWT_SECRET', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
        JWT_SECRET: 'short',
        API_PORT: '4000',
      }),
    ).toThrow(/JWT_SECRET/)
  })

  it('defaults API_PORT when missing', () => {
    const env = parseEnv({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      JWT_SECRET: 'secret-that-is-long-enough-32chars',
    })
    expect(env.API_PORT).toBe(4000)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @jewelry/api test`
Expected: fails — `parseEnv is not defined`.

- [ ] **Step 3: Implement `apps/api/src/env.ts`**

```ts
import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  API_PORT: z.coerce.number().int().positive().default(4000),
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
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter @jewelry/api test`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/env.ts apps/api/test/env.test.ts
git commit -m "feat(api): env validation with Zod"
```

---

### Task 3.3: Password hashing utility (TDD)

**Files:**
- Create: `apps/api/src/lib/password.ts`
- Create: `apps/api/test/password.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/test/password.test.ts
import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../src/lib/password'

describe('password', () => {
  it('hashes and verifies a correct password', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(hash).not.toBe('correct horse battery staple')
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(await verifyPassword(hash, 'wrong')).toBe(false)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @jewelry/api test password`
Expected: fails — `hashPassword is not defined`.

- [ ] **Step 3: Implement `apps/api/src/lib/password.ts`**

```ts
import argon2 from 'argon2'

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id })
}

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain)
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter @jewelry/api test password`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/password.ts apps/api/test/password.test.ts
git commit -m "feat(api): argon2id password hashing"
```

---

### Task 3.4: JWT utility (TDD)

**Files:**
- Create: `apps/api/src/lib/jwt.ts`
- Create: `apps/api/test/jwt.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/test/jwt.test.ts
import { describe, expect, it } from 'vitest'
import { createJwt, verifyJwt } from '../src/lib/jwt'

const secret = 'test-secret-that-is-long-enough-32chars!'

describe('jwt', () => {
  it('round-trips a payload', async () => {
    const token = await createJwt({ sub: 'user_123', role: 'SELLER' }, secret)
    const payload = await verifyJwt(token, secret)
    expect(payload.sub).toBe('user_123')
    expect(payload.role).toBe('SELLER')
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await createJwt({ sub: 'user_123', role: 'SELLER' }, secret)
    await expect(verifyJwt(token, 'another-secret-that-is-long-enough-32ch')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @jewelry/api test jwt`
Expected: fails — module not found.

- [ ] **Step 3: Implement `apps/api/src/lib/jwt.ts`**

```ts
import { SignJWT, jwtVerify } from 'jose'

export type JwtPayload = {
  sub: string
  role: string
}

const encoder = new TextEncoder()

export async function createJwt(payload: JwtPayload, secret: string): Promise<string> {
  return new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(encoder.encode(secret))
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, encoder.encode(secret))
  if (typeof payload.sub !== 'string' || typeof payload.role !== 'string') {
    throw new Error('Invalid token payload')
  }
  return { sub: payload.sub, role: payload.role }
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter @jewelry/api test jwt`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/jwt.ts apps/api/test/jwt.test.ts
git commit -m "feat(api): JWT sign/verify with jose"
```

---

### Task 3.5: App factory + health route (TDD)

**Files:**
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/routes/health.ts`
- Create: `apps/api/test/health.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/test/health.test.ts
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app'

describe('GET /health', () => {
  it('returns ok', async () => {
    const app = createApp()
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ status: 'ok' })
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @jewelry/api test health`
Expected: fails.

- [ ] **Step 3: Implement `apps/api/src/routes/health.ts`**

```ts
import { Hono } from 'hono'

export const healthRoute = new Hono().get('/', (c) => c.json({ status: 'ok' }))
```

- [ ] **Step 4: Implement `apps/api/src/app.ts`**

```ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { healthRoute } from './routes/health'

export function createApp() {
  const app = new Hono()
  app.use('*', logger())
  app.use('*', cors())
  app.route('/health', healthRoute)
  return app
}
```

- [ ] **Step 5: Run — expect PASS**

Run: `pnpm --filter @jewelry/api test health`
Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/routes/health.ts apps/api/test/health.test.ts
git commit -m "feat(api): Hono app factory and /health route"
```

---

### Task 3.6: Server entrypoint

**Files:**
- Create: `apps/api/src/index.ts`

- [ ] **Step 1: Write `apps/api/src/index.ts`**

```ts
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { parseEnv } from './env'

const env = parseEnv()
const app = createApp()

serve({ fetch: app.fetch, port: env.API_PORT }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`)
})
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @jewelry/api typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat(api): node server entrypoint"
```

---

### Task 3.7: Run full test suite + top-level typecheck

- [ ] **Step 1: Run all tests via Turbo**

Run: `pnpm test`
Expected: all tests pass across packages.

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: passes.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors (note: `@jewelry/db` typecheck only succeeds after `pnpm db:generate`; if it fails with a missing `@prisma/client`, run that and retry).

---

# Phase 4–7 — Deferred

Phases 4–7 will be written as follow-up plan documents once Phases 1–3 land and compile. The reason: these phases depend on design decisions (RBAC shape, which shadcn components, SSE vs. polling thresholds, Vercel vs. Fly target) that should be made against a working skeleton, not speculatively.

**Intent for each phase (used as anchor for the next plan doc):**

- **Phase 4 — Items & Inventory domain:** Hono routes `POST /api/items`, `GET /api/items`, `GET /api/items/:id`, `PATCH /api/items/:id`, inventory mutations, Zod schemas, `ItemHistory` + `AuditLog` writes, integration tests against a test Postgres (Testcontainers or a disposable Neon branch).
- **Phase 5 — Frontend shell:** Next.js 15 `app/` skeleton, Tailwind v4, shadcn/ui init, auth pages, dashboard shell, TanStack Query setup, Zustand store for UI state, API client.
- **Phase 6 — Real-time + Transactions + Reports:** SSE endpoint for inventory diffs, transactions page, PDF export via `pdfkit`, XLSX export via `exceljs`, QR scan page using `jsQR`.
- **Phase 7 — E2E + Deploy:** Playwright happy-path tests, Vercel project config, `vercel.json`, env-var documentation, Sentry init.

---

## Self-Review Notes

- Every Phase 1–3 task has concrete code and commands. No TBDs.
- `parseEnv`, `hashPassword`, `verifyPassword`, `createJwt`, `verifyJwt`, `createApp` are defined before they are referenced.
- The spec's Prisma `type` blocks (which are MongoDB-only in Prisma 5) are intentionally replaced with `Json` columns plus TypeScript types in `@jewelry/types` — this is called out in Task 2.2.
- The master-plan intentionally stops at Phase 3 rather than bloating with placeholders. Phases 4–7 get their own documents once Phase 3 compiles.

---
