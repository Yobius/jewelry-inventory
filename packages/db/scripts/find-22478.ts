import { prisma } from '../src/index.js'

// Search items that contain "22478" in sku, name, or identification
const bySkuContains = await prisma.item.findMany({
  where: { sku: { contains: '22478', mode: 'insensitive' } },
  select: {
    id: true,
    sku: true,
    name: true,
    material: true,
    carat: true,
    weight: true,
    pricing: true,
    identification: true,
    inventory: { select: { quantities: true } },
  },
  take: 10,
})
console.log(`Items with '22478' in SKU: ${bySkuContains.length}`)
for (const i of bySkuContains) {
  const q = (i.inventory?.quantities ?? {}) as Record<string, number>
  console.log(`  ${i.sku.padEnd(25)} ${i.name} · ${i.material} · ${i.weight}г`)
  console.log(`     quantities: ${JSON.stringify(q)}`)
  console.log(`     identification: ${JSON.stringify(i.identification)}`)
}

// Also check legacy barcodes / qr
const byBarcode = await prisma.$queryRaw<{ id: string; sku: string; name: string; ident: unknown }[]>`
  SELECT id, sku, name, identification AS ident
  FROM "Item"
  WHERE identification->>'barcode' = '22478'
     OR identification->>'qrCode' = '22478'
     OR identification->>'legacyId' = '22478'
     OR (identification->>'legacyRecordId')::text = '22478'
     OR (identification->>'legacyId')::text = '22478'
  LIMIT 10
`
console.log(`\nItems with '22478' in barcode/qr/legacyId: ${byBarcode.length}`)
for (const i of byBarcode) {
  console.log(`  ${i.sku.padEnd(25)} ${i.name}  ${JSON.stringify(i.ident)}`)
}

await prisma.$disconnect()
