import { NextResponse } from "next/server"
import { prisma } from "@voicecraft/db"
import { generateToken } from "@/lib/tokens"
import { sendVerificationEmail } from "@/lib/email"

export async function POST(req: Request) {
  const body = (await req.json()) as { email?: string }
  if (!body.email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { email: body.email } })
  if (!user) {
    // Return success to avoid email enumeration
    return NextResponse.json({ success: true })
  }

  if (user.emailVerified) {
    return NextResponse.json({ error: "Email is already verified" }, { status: 400 })
  }

  // Rate limit: check if a token was created in the last 60 seconds
  const existing = await prisma.emailVerificationToken.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  })

  if (existing) {
    const secondsAgo = (Date.now() - existing.createdAt.getTime()) / 1000
    if (secondsAgo < 60) {
      const retryAfter = Math.ceil(60 - secondsAgo)
      return NextResponse.json(
        { error: `Please wait ${retryAfter} seconds before resending.` },
        { status: 429 }
      )
    }
  }

  await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } })

  const { rawToken, tokenHash } = generateToken()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

  await prisma.emailVerificationToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  })

  await sendVerificationEmail(user.email, rawToken)

  return NextResponse.json({ success: true })
}
