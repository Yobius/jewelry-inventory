/** Also check the nab-import-test branch for jaroha0507. */
import { PrismaClient } from '@prisma/client'

const importBranch = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://neondb_owner:npg_8SbZmADPoyF3@ep-muddy-water-al66tqtn-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require',
    },
  },
})

const users = await importBranch.user.findMany({
  select: { id: true, email: true, name: true, role: true, createdAt: true },
})
console.log(`Users in nab-import-test branch (${users.length}):`)
for (const u of users) {
  console.log(`  ${u.role.padEnd(8)} ${u.email} (${u.name}) created=${u.createdAt.toISOString()}`)
}
await importBranch.$disconnect()
