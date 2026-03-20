import { auth } from "@/auth"
import { prisma } from "@voicecraft/db"
import { NextResponse } from "next/server"

/**
 * Next.js 16 proxy (replaces middleware.ts).
 *
 * Unlike the deprecated middleware convention, proxy runs exclusively on the
 * Node.js runtime — Prisma and other server-only modules are available here.
 * We use Auth.js `auth()` to decode the session from the JWT cookie, then
 * do a lightweight DB check for subscription status when the JWT data is stale.
 *
 * The matcher covers all authenticated app routes (no /dashboard prefix).
 */
export default auth(async (req) => {
  const session = req.auth

  if (!session) {
    return NextResponse.redirect(new URL("/login", req.nextUrl))
  }

  if (!session.user?.emailVerified) {
    return NextResponse.redirect(new URL("/verify-email", req.nextUrl))
  }

  // Subscription check — exempt the seeded demo user for local development.
  const isDemoUser = session.user.email === "admin@voicecraft.dev"

  if (!isDemoUser) {
    // The JWT may carry stale (or missing) subscription status if the user
    // subscribed after their last sign-in. Since proxy runs on Node.js, we
    // can do a lightweight DB check when the JWT says "no subscription".
    let subscriptionStatus = session.user.subscriptionStatus

    if (!subscriptionStatus) {
      const sub = await prisma.subscription.findUnique({
        where: { userId: session.user.id },
        select: { status: true },
      })
      subscriptionStatus = sub?.status ?? null
    }

    if (!subscriptionStatus) {
      return NextResponse.redirect(new URL("/choose-plan", req.nextUrl))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    "/voice-agents/:path*",
    "/calls/:path*",
    "/messages/:path*",
    "/appointments/:path*",
    "/contacts/:path*",
    "/settings/:path*",
  ],
}
