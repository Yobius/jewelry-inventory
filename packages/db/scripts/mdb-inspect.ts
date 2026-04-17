/**
 * Inspect the StoreOff MDB:
 *  1. Dump schema (columns + types) of every table
 *  2. Dump first 3 rows as JSON for the most important tables
 *  3. Print row counts
 *
 * Usage:
 *   pnpm tsx packages/db/scripts/mdb-inspect.ts <path-to-mdb> [--tables=A,B,C] [--sample=5]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import MDBReader from 'mdb-reader'

const args = process.argv.slice(2)
const mdbPath = args.find((a) => !a.startsWith('--')) ?? ''
if (!mdbPath) {
  console.error('usage: mdb-inspect.ts <path> [--tables=A,B] [--sample=N] [--out=dir]')
  process.exit(1)
}
const tablesArg = args.find((a) => a.startsWith('--tables='))?.slice(9)
const sample = Number.parseInt(args.find((a) => a.startsWith('--sample='))?.slice(9) ?? '3', 10)
const outDir = args.find((a) => a.startsWith('--out='))?.slice(6) ?? 'docs/mdb-analysis'

const buf = readFileSync(mdbPath)
const reader = new MDBReader(buf)

const allNames = reader.getTableNames().sort()
const filter = tablesArg ? new Set(tablesArg.split(',')) : null
const targets = filter ? allNames.filter((n) => filter.has(n)) : allNames

mkdirSync(outDir, { recursive: true })

type TableReport = {
  name: string
  rowCount: number
  columns: { name: string; type: string; size?: number }[]
  sample: Record<string, unknown>[]
}

const reports: TableReport[] = []

for (const name of targets) {
  try {
    const t = reader.getTable(name)
    const rowCount = t.rowCount
    const columns = t.getColumns().map((c) => ({ name: c.name, type: c.type, size: c.size }))
    let rows: Record<string, unknown>[] = []
    if (sample > 0 && rowCount > 0) {
      const data = t.getData()
      rows = data.slice(0, sample).map((r) => {
        const out: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(r)) {
          if (v instanceof Date) out[k] = v.toISOString()
          else if (Buffer.isBuffer(v)) out[k] = `<buffer ${v.length} bytes>`
          else out[k] = v
        }
        return out
      })
    }
    reports.push({ name, rowCount, columns, sample: rows })
    console.log(`${name.padEnd(28)} rows=${rowCount.toString().padStart(7)}  cols=${columns.length}`)
  } catch (e) {
    console.error(`  ! ${name}: ${(e as Error).message}`)
  }
}

writeFileSync(resolve(outDir, 'tables.json'), JSON.stringify(reports, null, 2), 'utf8')
console.log(`\nWrote ${reports.length} table reports → ${outDir}/tables.json`)
