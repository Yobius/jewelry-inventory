import { prisma } from '@jewelry/db'

type Row = { table_name: string }

const tables = await prisma.$queryRawUnsafe<Row[]>(
  "select table_name from information_schema.tables where table_schema='public' order by table_name",
)
console.log('tables:', tables.map((t) => t.table_name).join(', '))
await prisma.$disconnect()
