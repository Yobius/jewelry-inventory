/** Verify MDB → Neon import: distributions, samples, consistency checks. */
import { Prisma } from '@prisma/client'
import { prisma } from '../src/index.js'

// Material distribution
const byMaterial = await prisma.item.groupBy({
  by: ['material'],
  _count: { _all: true },
})
console.log('\n📊 By material:')
for (const { material, _count } of byMaterial) {
  console.log(`  ${material.padEnd(10)} ${_count._all}`)
}

// Location distribution (sum of inventory quantities across items)
const rawInv = await prisma.inventory.findMany({ select: { quantities: true } })
const loc = { warehouse: 0, point1: 0, point2: 0, point3: 0 }
for (const inv of rawInv) {
  const q = inv.quantities as Record<string, number>
  loc.warehouse += Number(q.warehouse ?? 0)
  loc.point1 += Number(q.point1 ?? 0)
  loc.point2 += Number(q.point2 ?? 0)
  loc.point3 += Number(q.point3 ?? 0)
}
console.log('\n📦 By location (sum of quantities):')
for (const [k, v] of Object.entries(loc)) console.log(`  ${k.padEnd(12)} ${v}`)

// Total units
const totalUnits = loc.warehouse + loc.point1 + loc.point2 + loc.point3
console.log(`  TOTAL UNITS  ${totalUnits}`)

// Top 5 suppliers by name
console.log('\n🏢 First 5 suppliers:')
const suppliers = await prisma.supplier.findMany({ take: 5, orderBy: { name: 'asc' } })
for (const s of suppliers) console.log(`  ${s.name}`)

// Carat distribution
const goldByCarat = await prisma.item.groupBy({
  by: ['carat'],
  where: { material: 'GOLD' },
  _count: { _all: true },
  orderBy: { carat: 'asc' },
})
console.log('\n🥇 Gold by carat:')
for (const { carat, _count } of goldByCarat) {
  console.log(`  ${carat ?? 'null'} → ${_count._all}`)
}

// Sample 3 items with legacy ID
const samples = await prisma.item.findMany({
  where: { identification: { path: ['legacyRecordId'], not: Prisma.AnyNull } } as never,
  take: 3,
  include: { inventory: true },
})
console.log('\n🔍 Sample items:')
for (const s of samples) {
  console.log(
    `  ${s.sku.padEnd(20)} ${s.name.padEnd(20)} ${s.material}/${s.carat ?? '-'} ${s.weight}г`,
  )
  console.log(`    inventory: ${JSON.stringify(s.inventory?.quantities)}`)
}

// Last import log entry
const lastImport = await prisma.import.findFirst({
  orderBy: { createdAt: 'desc' },
})
console.log('\n📋 Last import log:')
if (lastImport) {
  console.log(`  id: ${lastImport.id}`)
  console.log(`  filename: ${lastImport.filename}`)
  console.log(`  status: ${lastImport.status}`)
  console.log(`  rowsTotal: ${lastImport.rowsTotal}`)
  console.log(`  rowsCreated: ${lastImport.rowsCreated}`)
  console.log(`  rowsUpdated: ${lastImport.rowsUpdated}`)
}

await prisma.$disconnect()
