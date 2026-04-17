import { prisma } from '../src/index.js'

const invs = await prisma.inventory.findMany({ select: { quantities: true } })
const byLocation = { warehouse: 0, point1: 0, point2: 0, point3: 0 }
let totalUnits = 0
for (const inv of invs) {
  const q = (inv.quantities ?? {}) as Record<string, number>
  totalUnits +=
    Number(q.warehouse ?? 0) + Number(q.point1 ?? 0) + Number(q.point2 ?? 0) + Number(q.point3 ?? 0)
  for (const k of Object.keys(byLocation) as (keyof typeof byLocation)[]) {
    byLocation[k] += Number(q[k] ?? 0)
  }
}
console.log('Total items:', await prisma.item.count())
console.log('Total inventory rows:', invs.length)
console.log('Total units:', totalUnits)
console.log('By location:', byLocation)

const p1Items = await prisma.$queryRaw<{ id: string; sku: string; name: string; q: unknown }[]>`
  SELECT i.id, i.sku, i.name, inv.quantities AS q
  FROM "Item" i
  JOIN "Inventory" inv ON inv."itemId" = i.id
  WHERE (inv.quantities->>'point1')::int > 0
  LIMIT 5
`
console.log('\nSample 5 items with stock on Золото-Слобожа (point1):')
for (const r of p1Items) console.log(`  ${r.sku.padEnd(20)} ${r.name}  q=${JSON.stringify(r.q)}`)

const p1Count = await prisma.$queryRaw<{ count: bigint }[]>`
  SELECT COUNT(*)::bigint as count FROM "Inventory"
  WHERE (quantities->>'point1')::int > 0
`
console.log(`\nItems with point1 > 0: ${p1Count[0]?.count}`)

await prisma.$disconnect()
