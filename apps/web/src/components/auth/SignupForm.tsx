"use client"

import { useActionState } from "react"
import Link from "next/link"
import { signup } from "@/app/signup/actions"
import { signIn } from "next-auth/react"

export function SignupForm() {
  const [state, formAction, isPending] = useActionState(signup, undefined)

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        className="w-full flex items-center justify-center gap-3 px-4 py-2 border border-border rounded-lg bg-white text-ink text-sm font-medium hover:bg-cream transition-colors"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Continue with Google
      </button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-cream px-2 text-muted">or</span>
        </div>
      </div>

      <form action={formAction} className="space-y-4">
        {state?.error && (
          <p className="text-sm text-red-500">{state.error}</p>
        )}

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-ink mb-1">
            Name <span className="text-muted font-normal">(optional)</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            placeholder="Jane Smith"
            className="w-full px-3 py-2 border border-border rounded-lg bg-white text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm"
          />
        </div>

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

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-ink mb-1">
            Password
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

        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-ink text-cream py-2 px-4 rounded-lg hover:bg-ink/90 transition-colors font-medium disabled:opacity-60"
        >
          {isPending ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
