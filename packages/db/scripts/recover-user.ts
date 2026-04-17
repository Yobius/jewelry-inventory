/** Fetch the jaroha0507 user from the backup branch — one-off recovery script. */
import { writeFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

const backup = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://neondb_owner:npg_8SbZmADPoyF3@ep-quiet-voice-alhjku2e-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require',
    },
  },
})

const users = await backup.user.findMany({
  select: { id: true, email: true, name: true, role: true, password: true, createdAt: true },
})
console.log(`Users in backup branch (${users.length}):`)
for (const u of users) {
  console.log(`  ${u.role.padEnd(8)} ${u.email} (${u.name}) created=${u.createdAt.toISOString()}`)
}

const target = users.find((u) => u.email === 'jaroha0507@gmail.com')
if (target) {
  console.log('\n✓ FOUND jaroha0507@gmail.com:')
  console.log(JSON.stringify({ ...target, password: `${target.password.slice(0, 20)}…` }, null, 2))
  writeFileSync('/tmp/jaroha-user.json', JSON.stringify(target, null, 2))
  console.log('\n→ full record saved to /tmp/jaroha-user.json')
}

await backup.$disconnect()
