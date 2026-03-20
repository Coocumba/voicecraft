import { PrismaClient } from "@prisma/client"
import { hashSync } from "bcryptjs"
import { seedPlans } from "./seed-plans"

const prisma = new PrismaClient()

async function main() {
  const email = "admin@voicecraft.dev"

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log(`Seed user already exists: ${email}`)
  } else {
    await prisma.user.create({
      data: {
        email,
        name: "Admin",
        passwordHash: hashSync("password123", 10),
        emailVerified: new Date(),
      },
    })
    console.log(`Seeded demo user: ${email} / password123`)
  }

  await seedPlans(prisma)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
