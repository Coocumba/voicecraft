"use client"

import { useState } from "react"
import Link from "next/link"

export default function VerifyEmailPage() {
  const [step, setStep] = useState<"info" | "form" | "sending" | "sent" | "error">("info")
  const [resendError, setResendError] = useState("")

  async function handleResend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStep("sending")
    const email = (e.currentTarget.elements.namedItem("email") as HTMLInputElement).value

    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      if (res.status === 429) {
        const data = (await res.json()) as { error?: string }
        setResendError(data.error ?? "Please wait before resending.")
        setStep("error")
      } else {
        setStep("sent")
      }
    } catch {
      setResendError("Something went wrong. Please try again.")
      setStep("error")
    }
  }

  return (
    <main className="min-h-screen bg-cream flex items-center justify-center">
      <div className="w-full max-w-sm px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-6">
          <svg className="w-7 h-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="font-serif text-2xl text-ink mb-3">Check your inbox</h1>
        <p className="text-muted text-sm mb-8">
          We sent a verification link to your email address. Click the link to activate your account.
        </p>

        {step === "sent" && (
          <p className="text-sm text-success">A new verification email has been sent.</p>
        )}

        {step === "error" && (
          <p className="text-sm text-red-500 mb-4">{resendError}</p>
        )}

        {(step === "info" || step === "error") && (
          <div className="text-left">
            <p className="text-muted text-xs mb-2 text-center">Didn&apos;t receive it?</p>
            <form onSubmit={handleResend} className="flex gap-2">
              <input
                name="email"
                type="email"
                required
                placeholder="your@email.com"
                className="flex-1 px-3 py-2 border border-border rounded-lg bg-white text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm"
              />
              <button
                type="submit"
                className="px-3 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors whitespace-nowrap"
              >
                Resend
              </button>
            </form>
          </div>
        )}

        {step === "sending" && (
          <p className="text-muted text-sm">Sending…</p>
        )}

        <p className="mt-6 text-sm text-muted">
          <Link href="/login" className="text-accent hover:underline">Back to sign in</Link>
        </p>
      </div>
    </main>
  )
}
