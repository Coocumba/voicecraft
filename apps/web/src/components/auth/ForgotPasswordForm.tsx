"use client"

import { useState } from "react"
import Link from "next/link"

export function ForgotPasswordForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle")

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus("loading")

    const form = e.currentTarget
    const email = (form.elements.namedItem("email") as HTMLInputElement).value

    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      setStatus("sent")
    } catch {
      setStatus("error")
    }
  }

  if (status === "sent") {
    return (
      <div className="text-center">
        <p className="text-sm text-ink mb-4">
          If an account exists for that email, we&apos;ve sent a reset link. Check your inbox.
        </p>
        <Link href="/login" className="text-accent text-sm hover:underline">
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {status === "error" && (
        <p className="text-sm text-red-500">Something went wrong. Please try again.</p>
      )}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-ink mb-1">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          className="w-full px-3 py-2 border border-border rounded-lg bg-white text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full bg-ink text-cream py-2 px-4 rounded-lg hover:bg-ink/90 transition-colors font-medium disabled:opacity-60"
      >
        {status === "loading" ? "Sending…" : "Send reset link"}
      </button>
      <p className="text-center text-sm text-muted">
        <Link href="/login" className="text-accent hover:underline">Back to sign in</Link>
      </p>
    </form>
  )
}
