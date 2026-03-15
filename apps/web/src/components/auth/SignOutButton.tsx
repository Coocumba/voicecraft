"use client"

import { signOut } from "next-auth/react"

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ redirectTo: "/login" })}
      className="text-sm text-muted hover:text-ink transition-colors"
    >
      Sign out
    </button>
  )
}
