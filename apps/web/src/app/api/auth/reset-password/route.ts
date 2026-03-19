import { NextResponse } from "next/server"
import { prisma } from "@voicecraft/db"
import { hashToken } from "@/lib/tokens"
import { hashSync } from "bcryptjs"

export async function POST(req: Request) {
  const body = (await req.json()) as { token?: string; password?: string }

  if (!body.token || !body.password) {
    return NextResponse.json({ error: "Token and password required" }, { status: 400 })
  }

  if (body.password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
  }

  if (body.password.length > 72) {
    return NextResponse.json({ error: "Password must be 72 characters or fewer" }, { status: 400 })
  }

  const tokenHash = hashToken(body.token)

  // Look up outside the transaction to get userId for the update
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  })

  if (!record) {
    return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 })
  }

  const passwordHash = hashSync(body.password, 10)

  try {
    await prisma.$transaction(async (tx) => {
      // Atomic claim — delete with expiry check to prevent race/replay
      const deleted = await tx.passwordResetToken.deleteMany({
        where: {
          tokenHash,
          expiresAt: { gt: new Date() },
        },
      })

      if (deleted.count === 0) {
        throw new Error("ALREADY_USED")
      }

      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      })
    })
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_USED") {
      return NextResponse.json({ error: "This link is invalid or has already been used" }, { status: 400 })
    }
    throw err
  }

  return NextResponse.json({ success: true })
}
