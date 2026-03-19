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
    const { rawToken, tokenHash } = generateToken()
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } })
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    })

    try {
      await sendPasswordResetEmail(user.email, rawToken)
    } catch {
      // Fail silently — don't leak whether the email exists
    }
  }

  return NextResponse.json({ success: true })
}
