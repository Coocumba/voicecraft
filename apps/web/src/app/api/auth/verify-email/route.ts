import { NextResponse } from "next/server"
import { prisma } from "@voicecraft/db"
import { hashToken } from "@/lib/tokens"

export async function POST(req: Request) {
  const body = (await req.json()) as { token?: string }
  if (!body.token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 })
  }

  const tokenHash = hashToken(body.token)

  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
  })

  if (!record) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 })
  }

  if (record.expiresAt < new Date()) {
    return NextResponse.json({ error: "Token has expired" }, { status: 400 })
  }

  try {
    await prisma.$transaction(async (tx) => {
      const deleted = await tx.emailVerificationToken.deleteMany({
        where: { tokenHash },
      })
      if (deleted.count === 0) {
        throw new Error("ALREADY_USED")
      }
      await tx.user.update({
        where: { id: record.userId },
        data: { emailVerified: new Date() },
      })
    })
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_USED") {
      return NextResponse.json({ error: "Token already used" }, { status: 400 })
    }
    throw err
  }

  return NextResponse.json({ success: true })
}
