# Phase 4 — Items & Inventory Domain Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working auth + items + inventory + transactions API against the live Neon Postgres, with integration tests that hit the real DB and clean up after themselves.

**Architecture:** Flat route modules under `apps/api/src/routes/`, Zod schemas under `apps/api/src/schemas/`, DB helpers under `apps/api/src/services/`. Every mutation writes an `AuditLog` row; every `Item` update writes an `ItemHistory` row. Auth is JWT in `Authorization: Bearer <token>` header. Integration tests use a `test_` prefix on SKUs/emails so they can always be cleaned up.

**Tech Stack:** Hono 4, Prisma 5 (Neon), Zod, argon2, jose, Vitest.

---

## Files touched in this phase

```
apps/api/src/
├── app.ts                         # MODIFY — mount new routers
├── lib/
│   ├── auth-middleware.ts         # NEW — JWT middleware + Ctx type
│   └── audit.ts                   # NEW — writeAudit(userId, action, before, after)
├── schemas/
│   ├── auth.ts                    # NEW — register/login Zod
│   ├── item.ts                    # NEW — create/update Zod
│   ├── inventory.ts               # NEW — quantities patch Zod
│   └── transaction.ts             # NEW — movement Zod
├── services/
│   ├── items.ts                   # NEW — create/list/get/update
│   ├── inventory.ts               # NEW — adjustQuantities
│   └── transactions.ts            # NEW — recordTransaction (atomic)
└── routes/
    ├── auth.ts                    # NEW — POST /auth/register, /auth/login
    ├── items.ts                   # NEW — POST/GET/GET:id/PATCH:id
    ├── inventory.ts               # NEW — PATCH /inventory/:itemId
    └── transactions.ts            # NEW — POST/GET
apps/api/test/
├── helpers/
│   ├── db.ts                      # NEW — cleanupTestRows()
│   └── app.ts                     # NEW — makeTestApp() + register/login helpers
├── auth.integration.test.ts       # NEW
├── items.integration.test.ts      # NEW
├── inventory.integration.test.ts  # NEW
└── transactions.integration.test.ts # NEW
```

## Task groups

### Group A — Auth (schemas, service, routes, middleware)

- **4.1** Zod schemas for register/login → `schemas/auth.ts`
- **4.2** POST /auth/register + POST /auth/login → `routes/auth.ts`
- **4.3** `authMiddleware` that reads `Authorization: Bearer` → `lib/auth-middleware.ts`
- **4.4** Test helper `makeTestApp()` + `registerTestUser()` + cleanup → `test/helpers/*`
- **4.5** Auth integration test: register → login → protected route → 401 without token

### Group B — Items CRUD

- **4.6** Zod schemas for item create/update → `schemas/item.ts`
- **4.7** Items service (`create`, `list`, `getById`, `update` with history) → `services/items.ts`
- **4.8** Items router → `routes/items.ts`
- **4.9** Items integration test: create → list → get → update → 404 on missing

### Group C — Inventory & Transactions

- **4.10** Inventory schema + service (`adjustQuantities`) → `schemas/inventory.ts`, `services/inventory.ts`
- **4.11** Inventory router (`PATCH /inventory/:itemId`) → `routes/inventory.ts`
- **4.12** Transaction schema + service (atomic `recordTransaction`) → `schemas/transaction.ts`, `services/transactions.ts`
- **4.13** Transactions router (`POST /transactions`, `GET /transactions`)
- **4.14** Inventory + transactions integration tests: adjust quantities, record MOVE/IN/OUT, verify inventory mutates atomically

### Group D — Audit log + wiring

- **4.15** `writeAudit` helper called from create/update routes → `lib/audit.ts`
- **4.16** Audit log integration test: mutation creates exactly one `AuditLog` row
- **4.17** Mount all routers in `app.ts`, full test suite green, commit

---

## Test strategy

- **Integration tests hit real Neon** via the `.env` `DATABASE_URL`.
- Each test file has a `beforeAll` that creates a unique user (`test_<nanoid>@test.local`) and an `afterAll` that deletes all rows owned by that user via `User.id` cascades (Item cascades to Inventory/History; Transaction/AuditLog deleted explicitly).
- Vitest runs integration tests **serially** via `test.sequential` to avoid Neon connection-limit thrash.
- A dedicated test command `test:integration` is added but the default `test` keeps running unit + integration.

---

## Sequencing & commits

One commit per task group (A, B, C, D). Each commit leaves tests green. Red→green→commit loop.
