import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm"

export const metadata = { title: "Forgot password" }

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen bg-cream flex items-center justify-center">
      <div className="w-full max-w-sm px-6">
        <h1 className="font-serif text-3xl text-ink mb-2 text-center">
          VoiceCraft
        </h1>
        <p className="text-muted text-sm text-center mb-8">
          Reset your password
        </p>
        <ForgotPasswordForm />
      </div>
    </main>
  )
}
