/**
 * One-time cleanup: reset every Item's Inventory to exactly {loc: 1, others: 0}
 * based on the source-of-truth Movements.ClientID from the MDB.
 *
 * This corrects the double-counting that happened when the original migrator
 * called `incrementQty` instead of setting a fixed quantity.
 *
 * Idempotent: running it twice produces identical results.
 *
 * Usage:
 *   pnpm tsx packages/db/scripts/fix-inventory.ts <mdb-path> [--apply]
 */
import { readFileSync } from 'node:fs'
import MDBReader from 'mdb-reader'
import { prisma } from '../src/index.js'

const mdbPath = process.argv[2]
const APPLY = process.argv.includes('--apply')
if (!mdbPath) {
  console.error('usage: fix-inventory.ts <mdb-path> [--apply]')
  process.exit(1)
}

console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN (no writes)'}`)

// --- Build legacyRecordId → location map from MDB ---
const reader = new MDBReader(readFileSync(mdbPath))
const movements = reader.getTable('Movements').getData() as unknown as {
  RecordID: number
  ClientID: number | null
  Arch: boolean
  DateSold: Date | null
}[]

const clientToLoc = new Map<number, 'warehouse' | 'point1' | 'point2' | 'point3' | null>([
  [0, 'warehouse'],
  [1, 'warehouse'],
  [2, null],
  [3, 'point1'],
  [4, 'warehouse'],
  [5, 'point2'],
  [7, 'point3'],
])

const recordIdToLoc = new Map<number, 'warehouse' | 'point1' | 'point2' | 'point3'>()
for (const m of movements) {
  if (m.Arch || m.DateSold != null) continue
  const loc = m.ClientID != null ? clientToLoc.get(m.ClientID) : null
  if (!loc) continue
  recordIdToLoc.set(m.RecordID, loc)
}
console.log(`MDB active movements mapped: ${recordIdToLoc.size}`)

// --- Iterate over Items in DB, reset inventory ---
const items = await prisma.item.findMany({
  select: {
    id: true,
    sku: true,
    identification: true,
    inventory: { select: { quantities: true } },
  },
})
console.log(`Items in DB: ${items.length}`)

let fixed = 0
let unchanged = 0
let orphan = 0
let wrongBefore = 0

for (const item of items) {
  const ident = item.identification as Record<string, unknown>
  const legacyRecordId = ident?.legacyRecordId as number | undefined

  let targetLoc: 'warehouse' | 'point1' | 'point2' | 'point3' | null = null
  if (legacyRecordId != null) targetLoc = recordIdToLoc.get(legacyRecordId) ?? null

  if (!targetLoc) {
    // Non-MDB item (e.g. pre-existing test) — skip
    orphan++
    continue
  }

  const target = {
    warehouse: targetLoc === 'warehouse' ? 1 : 0,
    point1: targetLoc === 'point1' ? 1 : 0,
    point2: targetLoc === 'point2' ? 1 : 0,
    point3: targetLoc === 'point3' ? 1 : 0,
  }
  const current = (item.inventory?.quantities ?? {}) as Record<string, number>
  const needsFix =
    Number(current.warehouse ?? 0) !== target.warehouse ||
    Number(current.point1 ?? 0) !== target.point1 ||
    Number(current.point2 ?? 0) !== target.point2 ||
    Number(current.point3 ?? 0) !== target.point3

  if (!needsFix) {
    unchanged++
    continue
  }
  wrongBefore++

  if (APPLY) {
    await prisma.inventory.update({
      where: { itemId: item.id },
      data: { quantities: target },
    })
    fixed++
  }

  if ((fixed + wrongBefore) % 500 === 0) {
    console.log(
      `  progress: ${fixed + wrongBefore}/${items.length} (fixed=${fixed}, wrong=${wrongBefore}, unchanged=${unchanged}, orphan=${orphan})`,
    )
  }
}

console.log('\n📈 SUMMARY')
console.log(`Items checked:   ${items.length}`)
console.log(`Already correct: ${unchanged}`)
console.log(`Wrong:           ${wrongBefore}`)
console.log(`Fixed:           ${fixed}${APPLY ? '' : ' (dry-run)'}`)
console.log(`Orphan (no MDB): ${orphan}`)

await prisma.$disconnect()
