import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const session = req.auth
  const { pathname } = req.nextUrl

  const isDashboard = pathname.startsWith("/dashboard")
  if (!isDashboard) return NextResponse.next()

  if (!session) {
    return NextResponse.redirect(new URL("/login", req.nextUrl))
  }

  if (!session.user?.emailVerified) {
    return NextResponse.redirect(new URL("/verify-email", req.nextUrl))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/dashboard/:path*"],
}
