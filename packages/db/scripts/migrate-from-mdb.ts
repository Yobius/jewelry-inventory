/**
 * Migrate data from StoreOff MDB → our Prisma-backed PostgreSQL schema.
 *
 * USAGE:
 *   pnpm tsx packages/db/scripts/migrate-from-mdb.ts <mdb-path> [options]
 *
 * OPTIONS:
 *   --apply               Actually write to DB. Without this flag, dry-run only.
 *   --step=<name>         Which step to run. One of:
 *                           preflight  - stats only (default)
 *                           refs       - suppliers + system user (safe, idempotent)
 *                           items      - items + inventory from Movements
 *                           all        - refs then items
 *   --batch=<N>           Batch size for items (default 500)
 *   --start-from=<ID>     Skip Movements with RecordID < ID (resume)
 *   --owner-email=<email> User to attribute imported items to.
 *                         If omitted, creates mdb-import@system.local (ADMIN role).
 *   --errors-file=<path>  Where to write per-row errors (default errors-<ts>.json)
 *
 * EXAMPLES:
 *   # 1. See what would happen
 *   pnpm tsx packages/db/scripts/migrate-from-mdb.ts "/path/to.mdb"
 *
 *   # 2. Create suppliers + system user
 *   pnpm tsx packages/db/scripts/migrate-from-mdb.ts "/path/to.mdb" --step=refs --apply
 *
 *   # 3. Import all active items
 *   pnpm tsx packages/db/scripts/migrate-from-mdb.ts "/path/to.mdb" --step=items --apply
 *
 *   # 4. Resume from RecordID=54500
 *   pnpm tsx packages/db/scripts/migrate-from-mdb.ts "/path/to.mdb" --step=items --apply --start-from=54500
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import MDBReader from 'mdb-reader'
import { Prisma } from '@prisma/client'
import { prisma } from '../src/index.js'

// ---------- CLI parsing ----------

const args = process.argv.slice(2)
const mdbPath = args.find((a) => !a.startsWith('--'))
if (!mdbPath) {
  console.error('usage: migrate-from-mdb.ts <mdb-path> [--apply] [--step=<refs|items|all>] [--batch=N] [--start-from=ID] [--owner-email=X]')
  process.exit(1)
}

const APPLY = args.includes('--apply')
const STEP = (args.find((a) => a.startsWith('--step='))?.slice(7) ?? 'preflight') as
  | 'preflight'
  | 'refs'
  | 'items'
  | 'all'
const BATCH = Number.parseInt(args.find((a) => a.startsWith('--batch='))?.slice(8) ?? '500', 10)
const START_FROM = Number.parseInt(
  args.find((a) => a.startsWith('--start-from='))?.slice(13) ?? '0',
  10,
)
const OWNER_EMAIL = args.find((a) => a.startsWith('--owner-email='))?.slice(14)
const ERRORS_FILE =
  args.find((a) => a.startsWith('--errors-file='))?.slice(14) ??
  `mdb-migration-errors-${Date.now()}.json`

const DRY_RUN = !APPLY

console.log('='.repeat(70))
console.log(`MDB: ${mdbPath}`)
console.log(`Mode: ${DRY_RUN ? 'DRY-RUN (no DB writes)' : 'APPLY (writes to DB)'}`)
console.log(`Step: ${STEP}`)
console.log(`Batch: ${BATCH}${START_FROM ? `, resume from RecordID=${START_FROM}` : ''}`)
console.log('='.repeat(70))

if (!DRY_RUN) {
  console.log('\n⚠️  Running in APPLY mode. You have 5 seconds to cancel (Ctrl+C)…')
  await new Promise((r) => setTimeout(r, 5000))
}

// ---------- Load MDB ----------

const reader = new MDBReader(readFileSync(mdbPath))

type MdbProduct = {
  ID: number
  ArtNum: string | null
  ProductName: string | null
  Price: number | null
  PerGramm: number | null
  Category: number | null
  Group: number | null
}

type MdbMovement = {
  RecordID: number
  ID: number
  TypeOfProduct: number | null
  ProductID: number | null
  Weight: number | null
  InPrice: number | null
  OutPrice: number | null
  ClientID: number | null
  DateIncome: Date | null
  DateSold: Date | null
  DateReturn: Date | null
  Arch: boolean
  DocNum: string | null
  Comments: string | null
  StonesINFO: string | null
  DeliveryID: number | null
  SizeID: number | null
}

type MdbSupplier = {
  ID: number
  SupplName: string | null
  Address: string | null
  EDRPOU: string | null
  LicenseNum: string | null
  IsImport: boolean
}

type MdbTypeOfProduct = {
  ID: number
  Type: string | null
  IsGold: boolean
  IsSilver: boolean
  Probe: number | null
  IsWgh: boolean
}

type MdbCategory = { ID: number; CategoryName: string | null }
type MdbSize = { ID: number; Size: string | null }

const products = reader.getTable('Products').getData() as unknown as MdbProduct[]
const movements = reader.getTable('Movements').getData() as unknown as MdbMovement[]
const suppliers = reader.getTable('Supplyer').getData() as unknown as MdbSupplier[]
const typeOfProduct = reader
  .getTable('TypeOfProduct')
  .getData() as unknown as MdbTypeOfProduct[]
const categories = reader.getTable('Category').getData() as unknown as MdbCategory[]
const sizes = reader.getTable('Sizes').getData() as unknown as MdbSize[]

// ---------- Lookup tables ----------

type MaterialCarat = { material: 'GOLD' | 'SILVER' | 'PLATINUM' | 'OTHER'; carat: number | null }

const typeToMaterial = new Map<number, MaterialCarat>()
for (const t of typeOfProduct) {
  const hasCarat = t.Probe != null && t.Probe > 0 && t.Probe < 1000
  if (t.IsGold) typeToMaterial.set(t.ID, { material: 'GOLD', carat: hasCarat ? t.Probe! : null })
  else if (t.IsSilver)
    typeToMaterial.set(t.ID, { material: 'SILVER', carat: hasCarat ? t.Probe! : null })
  else typeToMaterial.set(t.ID, { material: 'OTHER', carat: hasCarat ? t.Probe! : null })
}

const productById = new Map<number, MdbProduct>()
for (const p of products) productById.set(p.ID, p)

const categoryById = new Map<number, string>()
for (const c of categories) if (c.CategoryName) categoryById.set(c.ID, c.CategoryName)

const sizeById = new Map<number, string>()
for (const s of sizes) if (s.Size?.trim()) sizeById.set(s.ID, s.Size.trim())

// ClientID → our location key. Based on analysis in docs/mdb-analysis/mapping.md.
const clientToLocation = new Map<number, 'warehouse' | 'point1' | 'point2' | 'point3' | null>([
  [0, 'warehouse'],
  [1, 'warehouse'], // "Поставщик"
  [2, null], // "Разовая продажа" - cash sale, skip
  [3, 'point1'], // "Золото-Слобожа."
  [4, 'warehouse'], // "Склад"
  [5, 'point2'], // "Донец"
  [7, 'point3'], // "Серебро-Слобожа."
])

// ---------- Step: preflight stats ----------

async function stepPreflight(): Promise<void> {
  const activeMovements = movements.filter((m) => !m.Arch && m.DateSold == null)
  const byLocation = { warehouse: 0, point1: 0, point2: 0, point3: 0, skipped: 0 }
  const byMaterial: Record<string, number> = {}
  let missingType = 0
  let missingProduct = 0

  for (const m of activeMovements) {
    const loc = m.ClientID != null ? clientToLocation.get(m.ClientID) : null
    if (loc == null) byLocation.skipped++
    else byLocation[loc]++

    const mc = m.TypeOfProduct != null ? typeToMaterial.get(m.TypeOfProduct) : null
    if (!mc) missingType++
    else byMaterial[mc.material] = (byMaterial[mc.material] ?? 0) + 1

    if (m.ProductID != null && !productById.has(m.ProductID)) missingProduct++
  }

  console.log('\n📊 PREFLIGHT STATS')
  console.log('-'.repeat(50))
  console.log(`Suppliers to import:    ${suppliers.filter((s) => s.SupplName).length}`)
  console.log(`Categories available:   ${categoryById.size}`)
  console.log(`Active movements:       ${activeMovements.length}`)
  console.log(`  missing TypeOfProduct: ${missingType}`)
  console.log(`  missing ProductID ref: ${missingProduct}`)
  console.log('\nBy location:')
  for (const [loc, n] of Object.entries(byLocation)) console.log(`  ${loc.padEnd(12)} ${n}`)
  console.log('\nBy material:')
  for (const [mat, n] of Object.entries(byMaterial)) console.log(`  ${mat.padEnd(12)} ${n}`)
  console.log('-'.repeat(50))
}

// ---------- Step: refs (suppliers + system user) ----------

async function ensureSystemUser(): Promise<string> {
  if (OWNER_EMAIL) {
    const u = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } })
    if (!u) throw new Error(`--owner-email ${OWNER_EMAIL} not found in DB`)
    return u.id
  }
  const email = 'mdb-import@system.local'
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return existing.id
  if (DRY_RUN) {
    console.log(`  [dry-run] would create system user ${email}`)
    return '<dry-run-system-user>'
  }
  const created = await prisma.user.create({
    data: {
      email,
      // argon2 hash of a random string (not usable for login)
      password: `$argon2id$v=19$m=65536,t=3,p=4$${'x'.repeat(22)}$${'y'.repeat(43)}`,
      name: 'MDB Import (system)',
      role: 'ADMIN',
    },
  })
  console.log(`  created system user: ${created.email}`)
  return created.id
}

async function stepRefs(): Promise<void> {
  console.log('\n📥 STEP: refs (suppliers + system user)')
  const userId = await ensureSystemUser()

  const named = suppliers.filter((s) => s.SupplName?.trim())
  let created = 0
  let skipped = 0
  for (const s of named) {
    const name = s.SupplName!.trim()
    const notes = [
      s.EDRPOU?.trim() && `EDRPOU: ${s.EDRPOU.trim()}`,
      s.Address?.trim() && `Адреса: ${s.Address.trim()}`,
      s.LicenseNum?.trim() && `Ліцензія: ${s.LicenseNum.trim()}`,
      s.IsImport && 'Імпорт',
      `legacyId: ${s.ID}`,
    ]
      .filter(Boolean)
      .join('; ')

    if (DRY_RUN) {
      skipped++
      continue
    }
    try {
      await prisma.supplier.upsert({
        where: { name },
        update: { notes },
        create: { name, notes },
      })
      created++
    } catch (e) {
      console.error(`  ! supplier "${name}": ${(e as Error).message}`)
    }
  }
  console.log(
    `  suppliers: ${DRY_RUN ? `${named.length} would be upserted` : `${created} upserted, ${skipped} skipped`}`,
  )
  console.log(`  system user id: ${userId}`)
}

// ---------- Step: items ----------

type RowError = { recordId: number; field?: string; message: string }

async function stepItems(): Promise<void> {
  console.log('\n📦 STEP: items (Movements → Item + Inventory)')

  const userId = await ensureSystemUser()
  const errors: RowError[] = []

  const active = movements
    .filter((m) => !m.Arch && m.DateSold == null)
    .filter((m) => m.RecordID >= START_FROM)
    .sort((a, b) => a.RecordID - b.RecordID)

  console.log(`  processing ${active.length} active movements`)

  // Create Import log row (for audit + potential rollback)
  let importId: string | null = null
  if (!DRY_RUN) {
    const imp = await prisma.import.create({
      data: {
        userId,
        filename: mdbPath!,
        rowsTotal: active.length,
        status: 'in-progress',
      },
    })
    importId = imp.id
    console.log(`  Import log row id: ${importId}`)
  }

  let processed = 0
  let created = 0
  let updated = 0
  let skipped = 0

  for (let i = 0; i < active.length; i += BATCH) {
    const batch = active.slice(i, i + BATCH)
    const batchStart = Date.now()

    // Build batch payload (not yet in txn)
    type Payload = {
      recordId: number
      sku: string
      name: string
      material: 'GOLD' | 'SILVER' | 'PLATINUM' | 'OTHER'
      carat: number | null
      weight: Prisma.Decimal
      specs: Prisma.JsonObject
      pricing: Prisma.JsonObject
      identification: Prisma.JsonObject
      supplierName: string | null
      location: 'warehouse' | 'point1' | 'point2' | 'point3'
    }

    const payloads: Payload[] = []

    for (const m of batch) {
      try {
        // Location
        const loc = m.ClientID != null ? clientToLocation.get(m.ClientID) : null
        if (!loc) {
          skipped++
          errors.push({ recordId: m.RecordID, field: 'ClientID', message: `no location mapping for ClientID=${m.ClientID}` })
          continue
        }

        // Material + carat
        const mc =
          m.TypeOfProduct != null ? typeToMaterial.get(m.TypeOfProduct) : null
        if (!mc) {
          errors.push({
            recordId: m.RecordID,
            field: 'TypeOfProduct',
            message: `unknown TypeOfProduct=${m.TypeOfProduct}, defaulting to OTHER`,
          })
        }
        const material = mc?.material ?? 'OTHER'
        const carat = mc?.carat ?? null

        // Product data
        const p = m.ProductID != null ? productById.get(m.ProductID) : undefined
        const artNum = (p?.ArtNum ?? '').trim() || `NOART-${m.RecordID}`
        const name = (p?.ProductName ?? '').trim() || `Товар ${artNum}`
        const sku = `${artNum}-${m.RecordID}`.slice(0, 50)

        // Weight
        const weightNum = Number(m.Weight ?? 0)
        const weight = new Prisma.Decimal(weightNum.toFixed(2))

        // Pricing
        const unitPrice = new Prisma.Decimal(Number(m.OutPrice ?? p?.Price ?? 0).toFixed(2))
        const perGram = new Prisma.Decimal(Number(p?.PerGramm ?? 0).toFixed(2))

        // Tags (category + size + doc)
        const tags: string[] = []
        if (p?.Category != null) {
          const catName = categoryById.get(p.Category)
          if (catName) tags.push(catName)
        }
        if (m.SizeID != null) {
          const sz = sizeById.get(m.SizeID)
          if (sz) tags.push(`size:${sz}`)
        }
        if (m.DocNum?.trim()) tags.push(`doc:${m.DocNum.trim()}`)

        const specs: Prisma.JsonObject = { tags }
        if (m.Comments?.trim()) specs.notes = m.Comments.trim()
        if (m.StonesINFO?.trim()) specs.stonesInfo = m.StonesINFO.trim()

        const pricing: Prisma.JsonObject = {
          unitPrice: unitPrice.toString(),
          perGram: perGram.toString(),
        }

        const identification: Prisma.JsonObject = {
          qrCode: `JWL-LEG-${m.RecordID}`,
          barcode: String(m.ID), // MDB's Movements.ID is the legacy barcode
          legacyRecordId: m.RecordID,
          legacyId: m.ID,
          legacyProductId: m.ProductID,
          legacyArtNum: artNum,
        }

        // Supplier comes from DeliveryID — skip for now, leave null.
        // When we have Delivery table analysis we can link back.

        payloads.push({
          recordId: m.RecordID,
          sku,
          name,
          material,
          carat,
          weight,
          specs,
          pricing,
          identification,
          supplierName: null,
          location: loc,
        })
      } catch (e) {
        errors.push({ recordId: m.RecordID, message: (e as Error).message })
        skipped++
      }
    }

    if (DRY_RUN) {
      processed += payloads.length
      if (i === 0 && payloads.length > 0) {
        console.log('\n  Sample payload (first row):')
        console.log('   ', JSON.stringify(payloads[0], null, 2).replace(/\n/g, '\n    '))
      }
      continue
    }

    // Apply batch as independent per-row upserts.
    // We avoid `$transaction` here because Neon pooler endpoint (PgBouncer transaction
    // mode) closes interactive transactions on ~60s timeout. Per-row upserts rely on
    // `sku @unique` for idempotency, which is sufficient — there is no cross-row
    // invariant we need to hold atomically.
    for (const pl of payloads) {
      try {
        const existing = await prisma.item.findUnique({
          where: { sku: pl.sku },
          include: { inventory: true },
        })

        if (existing) {
          await prisma.item.update({
            where: { sku: pl.sku },
            data: {
              name: pl.name,
              material: pl.material,
              carat: pl.carat,
              weight: pl.weight,
              specs: pl.specs,
              pricing: pl.pricing,
              identification: pl.identification,
            },
          })
          // Each MDB Movements row == exactly 1 physical unit, so we SET
          // (not increment) the inventory to make re-runs truly idempotent.
          const quantities = {
            warehouse: pl.location === 'warehouse' ? 1 : 0,
            point1: pl.location === 'point1' ? 1 : 0,
            point2: pl.location === 'point2' ? 1 : 0,
            point3: pl.location === 'point3' ? 1 : 0,
          }
          await prisma.inventory.upsert({
            where: { itemId: existing.id },
            update: { quantities },
            create: { itemId: existing.id, quantities },
          })
          updated++
        } else {
          await prisma.item.create({
            data: {
              sku: pl.sku,
              name: pl.name,
              material: pl.material,
              carat: pl.carat,
              weight: pl.weight,
              specs: pl.specs,
              pricing: pl.pricing,
              identification: pl.identification,
              createdBy: userId,
              inventory: {
                create: {
                  quantities: {
                    warehouse: pl.location === 'warehouse' ? 1 : 0,
                    point1: pl.location === 'point1' ? 1 : 0,
                    point2: pl.location === 'point2' ? 1 : 0,
                    point3: pl.location === 'point3' ? 1 : 0,
                  },
                },
              },
            },
          })
          created++
        }
      } catch (e) {
        errors.push({ recordId: pl.recordId, message: (e as Error).message })
      }
    }

    processed += payloads.length
    const ms = Date.now() - batchStart
    console.log(
      `  batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(active.length / BATCH)}: ${payloads.length} rows (${ms}ms) | total: created=${created} updated=${updated} skipped=${skipped} errors=${errors.length}`,
    )
  }

  if (!DRY_RUN && importId) {
    await prisma.import.update({
      where: { id: importId },
      data: {
        rowsCreated: created,
        rowsUpdated: updated,
        rowsSkipped: skipped,
        errors: errors.length ? (errors as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        status: errors.length > 0 ? 'completed-with-errors' : 'completed',
        completedAt: new Date(),
      },
    })
  }

  console.log('\n📈 SUMMARY')
  console.log('-'.repeat(50))
  console.log(`Processed: ${processed}`)
  console.log(`Created:   ${created}`)
  console.log(`Updated:   ${updated}`)
  console.log(`Skipped:   ${skipped}`)
  console.log(`Errors:    ${errors.length}`)

  if (errors.length > 0) {
    const path = resolve(ERRORS_FILE)
    writeFileSync(path, JSON.stringify(errors, null, 2), 'utf8')
    console.log(`Errors saved to: ${path}`)
  }
}

// ---------- Main ----------

try {
  await stepPreflight()
  if (STEP === 'refs' || STEP === 'all') await stepRefs()
  if (STEP === 'items' || STEP === 'all') await stepItems()

  console.log(`\n✓ done (${DRY_RUN ? 'DRY-RUN' : 'APPLIED'})`)
} catch (e) {
  console.error('\n✗ fatal:', (e as Error).message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
