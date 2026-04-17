/**
 * Import products from StoreOff MDB CSV exports into the jewelry inventory DB.
 *
 * Prerequisites:
 *   mdb-export "StoreOff Jew XP-3.22.mdb" Products > /tmp/mdb-export/products.csv
 *   mdb-export "StoreOff Jew XP-3.22.mdb" Category > /tmp/mdb-export/categories.csv
 *   mdb-export "StoreOff Jew XP-3.22.mdb" TypeOfProduct > /tmp/mdb-export/types.csv
 *
 * Usage:
 *   cd packages/db
 *   npx tsx scripts/import-from-mdb.ts
 */

import { readFileSync } from 'node:fs'
import { parse } from 'node:path'
import { type Material, PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ---------- CSV parser (minimal, handles quoted fields) ----------

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n')
  if (lines.length < 2) return []
  const headers = splitCSVLine(lines[0])
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const vals = splitCSVLine(line)
    const row: Record<string, string> = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = vals[j] ?? ''
    }
    rows.push(row)
  }
  return rows
}

function splitCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        result.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
  }
  result.push(current.trim())
  return result
}

// ---------- Load reference data ----------

const categoriesRaw = parseCSV(readFileSync('/tmp/mdb-export/categories.csv', 'utf-8'))
const categoryMap = new Map<string, string>()
for (const row of categoriesRaw) {
  categoryMap.set(row.ID, row.CategoryName)
}

const typesRaw = parseCSV(readFileSync('/tmp/mdb-export/types.csv', 'utf-8'))
type TypeInfo = { material: Material; carat: number | null; name: string }
const typeMap = new Map<string, TypeInfo>()
for (const row of typesRaw) {
  const isGold = row.IsGold === '1'
  const isSilver = row.IsSilver === '1'
  const probe = row.Probe ? Number.parseInt(row.Probe, 10) : null
  const material: Material = isGold ? 'GOLD' : isSilver ? 'SILVER' : 'OTHER'
  typeMap.set(row.ID, { material, carat: probe && probe > 0 ? probe : null, name: row.Type })
}

// ---------- Load products ----------

const productsRaw = parseCSV(readFileSync('/tmp/mdb-export/products.csv', 'utf-8'))
console.log(`Loaded ${productsRaw.length} products from CSV`)

// ---------- Find or create admin user ----------

async function getOrCreateUser(): Promise<string> {
  const existing = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
  if (existing) return existing.id
  const user = await prisma.user.create({
    data: {
      email: 'import@system',
      password: '$argon2id$v=19$m=65536,t=3,p=4$placeholder',
      name: 'MDB Import',
      role: 'ADMIN',
    },
  })
  return user.id
}

// ---------- Import ----------

async function main() {
  const userId = await getOrCreateUser()
  console.log(`Using user ID: ${userId}`)

  // Track used SKUs to handle duplicates
  const usedSkus = new Set<string>()
  // Also check existing SKUs in DB
  const existingItems = await prisma.item.findMany({ select: { sku: true } })
  for (const item of existingItems) {
    usedSkus.add(item.sku)
  }
  console.log(`${usedSkus.size} SKUs already in DB`)

  let imported = 0
  let skipped = 0
  let errors = 0
  const BATCH_SIZE = 100

  for (let i = 0; i < productsRaw.length; i += BATCH_SIZE) {
    const batch = productsRaw.slice(i, i + BATCH_SIZE)
    const creates = []

    for (const row of batch) {
      const artNum = row.ArtNum?.trim()
      if (!artNum) {
        skipped++
        continue
      }

      // Resolve type
      const typeInfo = typeMap.get(row.Group) ?? {
        material: 'OTHER' as Material,
        carat: null,
        name: '',
      }
      const categoryName = categoryMap.get(row.Category) ?? null

      // Build unique SKU
      let sku = artNum
      if (usedSkus.has(sku)) {
        // Append material suffix for duplicates
        const suffix =
          typeInfo.material === 'GOLD' ? 'G' : typeInfo.material === 'SILVER' ? 'S' : 'X'
        sku = `${artNum}-${suffix}`
        if (usedSkus.has(sku)) {
          sku = `${artNum}-${suffix}${row.ID}`
        }
        if (usedSkus.has(sku)) {
          skipped++
          continue
        }
      }
      usedSkus.add(sku)

      const weight = Number.parseFloat(row.Wgh_ug || '0') || 0
      const perGram = Number.parseFloat(row.PerGramm || '0') || 0
      const price = Number.parseFloat(row.Price || '0') || 0
      const silvPerGram = Number.parseFloat(row.SilvPerGramm || '0') || 0

      const unitPrice =
        price > 0
          ? price
          : perGram > 0
            ? perGram * weight
            : silvPerGram > 0
              ? silvPerGram * weight
              : 0

      creates.push({
        sku,
        name: row.ProductName?.trim() || 'Без назви',
        category: categoryName,
        material: typeInfo.material,
        carat: typeInfo.carat,
        weight: Math.max(weight, 0),
        specs: { tags: categoryName ? [categoryName] : [] },
        pricing: {
          unitPrice: unitPrice.toFixed(2),
          perGram: (perGram || silvPerGram).toFixed(2),
        },
        identification: { qrCode: `MDB-${row.ID}` },
        createdBy: userId,
      })
    }

    if (creates.length > 0) {
      try {
        await prisma.item.createMany({ data: creates, skipDuplicates: true })
        imported += creates.length
      } catch (e) {
        // Fallback: insert one by one
        for (const data of creates) {
          try {
            await prisma.item.create({ data })
            imported++
          } catch {
            errors++
          }
        }
      }
    }

    if ((i + BATCH_SIZE) % 5000 === 0 || i + BATCH_SIZE >= productsRaw.length) {
      console.log(
        `  Progress: ${Math.min(i + BATCH_SIZE, productsRaw.length)}/${productsRaw.length} | imported: ${imported} | skipped: ${skipped} | errors: ${errors}`,
      )
    }
  }

  console.log(`\nDone! Imported: ${imported}, Skipped: ${skipped}, Errors: ${errors}`)
  console.log(`Total items in DB: ${await prisma.item.count()}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
