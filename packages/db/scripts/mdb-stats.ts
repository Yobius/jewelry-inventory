/**
 * Pre-flight stats for the MDB migration.
 *  - Unique ArtNum count in Products
 *  - Movements row counts by Arch / DateSold / ClientID
 *  - TypeOfProduct → material+carat mapping sanity
 *  - Distribution of Movements.ClientID
 */
import { readFileSync } from 'node:fs'
import MDBReader from 'mdb-reader'

const mdbPath = process.argv[2]
if (!mdbPath) {
  console.error('usage: mdb-stats.ts <path>')
  process.exit(1)
}

const reader = new MDBReader(readFileSync(mdbPath))

// --- Products unique ArtNum ---
const products = reader.getTable('Products').getData()
const artNums = new Map<string, number>()
let emptyArt = 0
for (const p of products) {
  const art = (p.ArtNum as string | null)?.trim()
  if (!art) {
    emptyArt++
    continue
  }
  artNums.set(art, (artNums.get(art) ?? 0) + 1)
}
const dups = [...artNums.entries()].filter(([, n]) => n > 1)
console.log(`Products: ${products.length} rows`)
console.log(`  unique ArtNum:  ${artNums.size}`)
console.log(`  empty ArtNum:   ${emptyArt}`)
console.log(`  duplicate ArtNum groups: ${dups.length}`)
console.log(`  max duplicates for one ArtNum: ${dups.length ? Math.max(...dups.map(([, n]) => n)) : 0}`)
if (dups.length > 0) {
  console.log('  top 5 duplicated:')
  for (const [art, n] of dups.sort(([, a], [, b]) => b - a).slice(0, 5)) {
    console.log(`    "${art}" → ${n} rows`)
  }
}

// --- Movements archive / sold breakdown ---
const movements = reader.getTable('Movements').getData()
let archTrue = 0
let soldTrue = 0
let returned = 0
let active = 0
const byClient = new Map<number, number>()
for (const m of movements) {
  const arch = m.Arch as boolean
  const sold = (m.DateSold as Date | null) != null
  const ret = (m.DateReturn as Date | null) != null
  if (arch) archTrue++
  if (sold) soldTrue++
  if (ret) returned++
  if (!arch && !sold) {
    active++
    const cid = m.ClientID as number
    byClient.set(cid, (byClient.get(cid) ?? 0) + 1)
  }
}
console.log(`\nMovements: ${movements.length} rows`)
console.log(`  Arch=true:       ${archTrue}`)
console.log(`  DateSold set:    ${soldTrue}`)
console.log(`  DateReturn set:  ${returned}`)
console.log(`  ACTIVE (in stock): ${active}`)
console.log('  distribution by ClientID among active:')
for (const [cid, n] of [...byClient.entries()].sort(([, a], [, b]) => b - a)) {
  console.log(`    ClientID=${cid}: ${n}`)
}

// --- TypeOfProduct material+carat mapping ---
const top = reader.getTable('TypeOfProduct').getData()
console.log(`\nTypeOfProduct: ${top.length} rows`)
for (const t of top) {
  const mat = (t.IsGold as boolean)
    ? 'GOLD'
    : (t.IsSilver as boolean)
      ? 'SILVER'
      : 'OTHER'
  console.log(`  ID=${t.ID} "${t.Type}" → material=${mat}, carat=${t.Probe}, IsWgh=${t.IsWgh}`)
}

// --- Clients ---
const clients = reader.getTable('Clients').getData()
console.log(`\nClients: ${clients.length} rows`)
for (const c of clients) {
  console.log(`  ID=${c.ID} "${c.ClientsName}" IsShop=${c.IsShop} BirkNum=${c.BirkNum}`)
}

// --- Suppliers ---
const supp = reader.getTable('Supplyer').getData()
console.log(`\nSupplyer: ${supp.length} rows (showing non-null names)`)
const named = supp.filter((s) => s.SupplName)
console.log(`  with name: ${named.length}`)
console.log('  first 10:')
for (const s of named.slice(0, 10)) {
  console.log(`    ID=${s.ID} "${s.SupplName}" (EDRPOU=${s.EDRPOU ?? '-'}, IsImport=${s.IsImport})`)
}

// --- Categories ---
const cats = reader.getTable('Category').getData()
console.log(`\nCategory: ${cats.length} rows`)
for (const c of cats) {
  console.log(`  ID=${c.ID} "${c.CategoryName}"`)
}
