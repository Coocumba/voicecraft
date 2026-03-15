"use client"

import { signOut } from "next-auth/react"

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ redirectTo: "/login" })}
      className="text-sm text-cream/60 hover:text-cream transition-colors"
    >
      Sign out
    </button>
  )
}
