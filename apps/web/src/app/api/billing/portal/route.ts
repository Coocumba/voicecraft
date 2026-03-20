import { auth } from "@/auth"
import { prisma } from "@voicecraft/db"
import { stripe } from "@/lib/stripe"

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { stripeCustomerId: true },
    })

    if (!user?.stripeCustomerId) {
      return Response.json(
        { error: "No billing account found. Complete a checkout first." },
        { status: 422 }
      )
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${appUrl}/dashboard/settings`,
    })

    return Response.json({ url: portalSession.url })
  } catch (err) {
    console.error("[POST /api/billing/portal]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
