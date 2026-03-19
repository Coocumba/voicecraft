"use client"

import { useState } from "react"

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle")

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
        {status === "sent" && (
          <p className="text-sm text-success mb-4">
            A new verification email has been sent.
          </p>
        )}
        {status === "idle" && (
          <button
            onClick={() => setStatus("sending")}
            className="text-accent text-sm hover:underline"
          >
            Didn&apos;t receive it? Resend email
          </button>
        )}
        {status === "sending" && (
          <p className="text-muted text-sm">Sending…</p>
        )}
        <p className="mt-6 text-sm text-muted">
          <a href="/login" className="text-accent hover:underline">Back to sign in</a>
        </p>
      </div>
    </main>
  )
}
