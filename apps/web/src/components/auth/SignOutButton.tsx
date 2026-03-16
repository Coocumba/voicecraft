"use client"

import { signOut } from "next-auth/react"

interface SignOutButtonProps {
  variant?: 'light' | 'dark'
}

export function SignOutButton({ variant = 'dark' }: SignOutButtonProps) {
  return (
    <button
      onClick={() => signOut({ redirectTo: "/login" })}
      className={
        variant === 'light'
          ? "w-full text-left px-3 py-1.5 text-sm text-muted hover:text-ink hover:bg-cream rounded-lg transition-colors"
          : "text-sm text-cream/60 hover:text-cream transition-colors"
      }
    >
      Sign out
    </button>
  )
}
