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

  // Subscription check — exempt choose-plan page to avoid redirect loop.
  // Also exempt the seeded demo user for local development.
  const isChoosePlan = pathname.startsWith("/dashboard/choose-plan")
  const isDemoUser = session.user.email === "admin@voicecraft.dev"
  if (!isChoosePlan && !isDemoUser && !session.user.subscriptionStatus) {
    return NextResponse.redirect(new URL("/dashboard/choose-plan", req.nextUrl))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/dashboard/:path*"],
}
