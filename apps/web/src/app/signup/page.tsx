import { SignupForm } from "@/components/auth/SignupForm"

export const metadata = { title: "Create account" }

export default function SignupPage() {
  return (
    <main className="min-h-screen bg-cream flex items-center justify-center">
      <div className="w-full max-w-sm px-6 py-10">
        <h1 className="font-serif text-3xl text-ink mb-2 text-center">
          VoiceCraft
        </h1>
        <p className="text-muted text-sm text-center mb-8">
          Create your account
        </p>
        <SignupForm />
      </div>
    </main>
  )
}
