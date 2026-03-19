import { NextResponse } from "next/server"
import { prisma } from "@voicecraft/db"
import { generateToken } from "@/lib/tokens"
import { sendPasswordResetEmail } from "@/lib/email"

export async function POST(req: Request) {
  const body = (await req.json()) as { email?: string }

  // Always return success — prevents email enumeration
  if (!body.email) {
    return NextResponse.json({ success: true })
  }

  const user = await prisma.user.findUnique({ where: { email: body.email } })

  // Only send reset for accounts that have a password (not OAuth-only)
  if (user && user.passwordHash) {
    // Rate limit: check if a reset was recently requested
    const recentToken = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    })
    if (recentToken) {
      const secondsAgo = (Date.now() - recentToken.createdAt.getTime()) / 1000
      if (secondsAgo < 60) {
        // Return success silently — don't reveal rate limiting to prevent enumeration
        return NextResponse.json({ success: true })
      }
    }

    const { rawToken, tokenHash } = generateToken()
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } })
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    })

    try {
      await sendPasswordResetEmail(user.email, rawToken)
    } catch {
      // Roll back token so the user isn't blocked by a failed send
      await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } })
    }
  }

  return NextResponse.json({ success: true })
}
