"use client"

import { useActionState } from "react"
import { authenticate } from "@/app/login/actions"

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(authenticate, undefined)

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <p className="text-sm text-red-500">{state.error}</p>
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
          placeholder="admin@voicecraft.dev"
          className="w-full px-3 py-2 border border-border rounded-lg bg-white text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-ink mb-1">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          placeholder="Enter your password"
          className="w-full px-3 py-2 border border-border rounded-lg bg-white text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-ink text-cream py-2 px-4 rounded-lg hover:bg-ink/90 transition-colors font-medium disabled:opacity-60"
      >
        {isPending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  )
}
