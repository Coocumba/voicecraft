import { redirect } from "next/navigation"
import { prisma } from "@voicecraft/db"
import { hashToken } from "@/lib/tokens"

interface Props {
  searchParams: Promise<{ token?: string }>
}

export default async function VerifyEmailConfirmPage({ searchParams }: Props) {
  const { token } = await searchParams

  if (!token) {
    redirect("/verify-email")
  }

  const tokenHash = hashToken(token)
  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
  })

  if (!record) {
    return <ErrorState message="This link is invalid or has already been used." />
  }

  if (record.expiresAt < new Date()) {
    return <ErrorState message="This link has expired." />
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerified: new Date() },
    }),
    prisma.emailVerificationToken.delete({ where: { tokenHash } }),
  ])

  redirect("/login?verified=true")
}

function ErrorState({ message }: { message: string }) {
  return (
    <main className="min-h-screen bg-cream flex items-center justify-center">
      <div className="w-full max-w-sm px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
          <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <h1 className="font-serif text-2xl text-ink mb-3">Link problem</h1>
        <p className="text-muted text-sm mb-6">{message}</p>
        <a href="/verify-email" className="text-accent text-sm hover:underline">
          Request a new verification email
        </a>
        <p className="mt-4 text-sm text-muted">
          <a href="/login" className="text-accent hover:underline">Back to sign in</a>
        </p>
      </div>
    </main>
  )
}
