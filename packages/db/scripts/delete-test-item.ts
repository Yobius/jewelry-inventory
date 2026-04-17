/** Delete the pre-existing test item (sku=24) that's not from MDB. */
import { prisma } from '../src/index.js'

const testItem = await prisma.item.findUnique({
  where: { sku: '24' },
  include: { inventory: true, transactions: true },
})
if (!testItem) {
  console.log('No item sku=24 found')
  process.exit(0)
}
console.log('Test item before delete:')
console.log(`  sku: ${testItem.sku}`)
console.log(`  name: ${testItem.name}`)
console.log(`  material: ${testItem.material}`)
console.log(`  identification: ${JSON.stringify(testItem.identification)}`)
console.log(`  inventory: ${JSON.stringify(testItem.inventory?.quantities)}`)
console.log(`  transactions: ${testItem.transactions.length}`)

if (testItem.transactions.length > 0) {
  console.log('  ⚠️  has transactions — not deleting')
  process.exit(1)
}

if (!process.argv.includes('--apply')) {
  console.log('\n(dry-run: pass --apply to delete)')
  process.exit(0)
}

// Delete inventory first (cascade would handle but explicit is clearer)
if (testItem.inventory) {
  await prisma.inventory.delete({ where: { id: testItem.inventory.id } })
}
await prisma.item.delete({ where: { id: testItem.id } })
console.log('\n✓ deleted')
await prisma.$disconnect()
