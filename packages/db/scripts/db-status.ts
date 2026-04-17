/** Quick snapshot of what's currently in the DB. */
import { prisma } from '../src/index.js'

const u = await prisma.user.count()
const i = await prisma.item.count()
const inv = await prisma.inventory.count()
const s = await prisma.supplier.count()
const m = await prisma.manufacturer.count()
const st = await prisma.stone.count()
const t = await prisma.transaction.count()
const imp = await prisma.import.count()
const pj = await prisma.printJob.count()

console.log('=== Current DB state ===')
console.log(`Users:          ${u}`)
console.log(`Items:          ${i}`)
console.log(`Inventory rows: ${inv}`)
console.log(`Suppliers:      ${s}`)
console.log(`Manufacturers:  ${m}`)
console.log(`Stones:         ${st}`)
console.log(`Transactions:   ${t}`)
console.log(`Imports log:    ${imp}`)
console.log(`Print jobs:     ${pj}`)

if (u > 0) {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true },
    take: 5,
  })
  console.log('\nUsers:')
  for (const user of users)
    console.log(`  ${user.role.padEnd(8)} ${user.email} (${user.name}) [${user.id}]`)
}

await prisma.$disconnect()
