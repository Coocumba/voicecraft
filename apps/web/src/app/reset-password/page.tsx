import { Suspense } from "react"
import Link from "next/link"
import { prisma } from "@voicecraft/db"
import { hashToken } from "@/lib/tokens"
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm"

export const metadata = { title: "Reset password" }

interface Props {
  searchParams: Promise<{ token?: string }>
}

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token } = await searchParams

  let isValid = false
  let errorMessage = "This reset link is invalid."

  if (token) {
    const tokenHash = hashToken(token)
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    })

    if (!record) {
      errorMessage = "This link is invalid or has already been used."
    } else if (record.expiresAt < new Date()) {
      errorMessage = "This link has expired."
    } else {
      isValid = true
    }
  }

  return (
    <main className="min-h-screen bg-cream flex items-center justify-center">
      <div className="w-full max-w-sm px-6">
        <h1 className="font-serif text-3xl text-ink mb-2 text-center">
          VoiceCraft
        </h1>
        <p className="text-muted text-sm text-center mb-8">
          {isValid ? "Choose a new password" : "Link problem"}
        </p>
        <Suspense fallback={null}>
          <ResetPasswordForm
            isValid={isValid}
            errorMessage={errorMessage}
          />
        </Suspense>
        {!isValid && (
          <p className="text-center text-sm text-muted mt-4">
            <Link href="/login" className="text-accent hover:underline">Back to sign in</Link>
          </p>
        )}
      </div>
    </main>
  )
}
