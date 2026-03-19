"use server"

import { redirect } from "next/navigation"
import { prisma } from "@voicecraft/db"
import { hash } from "bcryptjs"
import { generateToken } from "@/lib/tokens"
import { sendVerificationEmail } from "@/lib/email"

export type SignupState = { error: string } | undefined

export async function signup(
  prevState: SignupState,
  formData: FormData
): Promise<SignupState> {
  const email = (formData.get("email") as string | null)?.trim() ?? ""
  const password = (formData.get("password") as string | null) ?? ""
  const name = (formData.get("name") as string | null)?.trim() ?? ""

  if (!email || !password) {
    return { error: "Email and password are required." }
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." }
  }
  if (password.length > 72) {
    return { error: "Password must be 72 characters or fewer." }
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return { error: "An account with this email already exists." }
  }

  const passwordHash = await hash(password, 10)
  const user = await prisma.user.create({
    data: {
      email,
      name: name || null,
      passwordHash,
      emailVerified: null,
    },
  })

  const { rawToken, tokenHash } = generateToken()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

  await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } })
  await prisma.emailVerificationToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  })

  try {
    await sendVerificationEmail(email, rawToken)
  } catch {
    // Don't block signup if email fails — user can resend
  }

  redirect("/verify-email")
}
