import { PrismaClient } from "@prisma/client"
import { hashSync } from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  const email = "admin@voicecraft.dev"

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log(`Seed user already exists: ${email}`)
    return
  }

  await prisma.user.create({
    data: {
      email,
      name: "Admin",
      passwordHash: hashSync("password123", 10),
    },
  })

  console.log(`Seeded demo user: ${email} / password123`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
