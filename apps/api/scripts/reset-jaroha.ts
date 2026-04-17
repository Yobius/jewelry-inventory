import { prisma } from '@jewelry/db'
import argon2 from 'argon2'

const hash = await argon2.hash('test-pw-for-inventory-check-12345', { type: argon2.argon2id })
const u = await prisma.user.update({
  where: { email: 'jaroha0507@gmail.com' },
  data: { password: hash },
  select: { id: true, email: true },
})
console.log('Reset password for', u.email)
await prisma.$disconnect()
