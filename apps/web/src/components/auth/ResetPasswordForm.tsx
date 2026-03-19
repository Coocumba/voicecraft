"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useSearchParams } from "next/navigation"
import Link from "next/link"

interface Props {
  isValid: boolean
  errorMessage?: string
}

export function ResetPasswordForm({ isValid, errorMessage }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token") ?? ""
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle")
  const [error, setError] = useState("")

  if (!isValid) {
    return (
      <div className="text-center">
        <p className="text-sm text-red-500 mb-4">{errorMessage}</p>
        <Link href="/forgot-password" className="text-accent text-sm hover:underline">
          Request a new reset link
        </Link>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus("loading")
    setError("")

    const form = e.currentTarget
    const password = (form.elements.namedItem("password") as HTMLInputElement).value
    const confirm = (form.elements.namedItem("confirm") as HTMLInputElement).value

    if (password !== confirm) {
      setError("Passwords do not match.")
      setStatus("idle")
      return
    }

    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    })

    if (res.ok) {
      router.push("/login?reset=true")
    } else {
      const data = (await res.json()) as { error?: string }
      setError(data.error ?? "Something went wrong.")
      setStatus("idle")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-red-500">{error}</p>}

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-ink mb-1">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={72}
          placeholder="Min. 8 characters"
          className="w-full px-3 py-2 border border-border rounded-lg bg-white text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm"
        />
      </div>

      <div>
        <label htmlFor="confirm" className="block text-sm font-medium text-ink mb-1">
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
          maxLength={72}
          placeholder="Repeat your password"
          className="w-full px-3 py-2 border border-border rounded-lg bg-white text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full bg-ink text-cream py-2 px-4 rounded-lg hover:bg-ink/90 transition-colors font-medium disabled:opacity-60"
      >
        {status === "loading" ? "Updating…" : "Update password"}
      </button>
    </form>
  )
}
