/** Find items with inventory sum > 1 (should be 0 after fix). */
import { prisma } from '../src/index.js'

const invs = await prisma.inventory.findMany({
  select: { itemId: true, quantities: true, item: { select: { sku: true, identification: true } } },
})

const bad: { sku: string; sum: number; q: Record<string, number>; legacyId?: unknown }[] = []
let totalSum = 0
for (const inv of invs) {
  const q = inv.quantities as Record<string, number>
  const sum =
    Number(q.warehouse ?? 0) +
    Number(q.point1 ?? 0) +
    Number(q.point2 ?? 0) +
    Number(q.point3 ?? 0)
  totalSum += sum
  if (sum !== 1) {
    const ident = inv.item.identification as Record<string, unknown>
    bad.push({ sku: inv.item.sku, sum, q, legacyId: ident?.legacyRecordId })
  }
}
console.log(`Total inventories: ${invs.length}`)
console.log(`Total sum of quantities: ${totalSum}`)
console.log(`Items with sum != 1: ${bad.length}`)
console.log('\nFirst 15 anomalies:')
for (const b of bad.slice(0, 15)) {
  console.log(`  sku=${b.sku.padEnd(25)} sum=${b.sum}  q=${JSON.stringify(b.q)}  legacyId=${b.legacyId ?? '-'}`)
}
await prisma.$disconnect()
