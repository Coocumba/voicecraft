import { auth } from "@/auth"
import { prisma, PhoneNumberStatus } from "@voicecraft/db"

/**
 * GET — List all AVAILABLE pool numbers that belong to the authenticated user.
 * These are numbers that have been released from an agent and are ready to be
 * reassigned, ordered by most-recently released first.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const numbers = await prisma.phoneNumber.findMany({
      where: {
        userId: session.user.id,
        status: PhoneNumberStatus.AVAILABLE,
      },
      orderBy: { releasedAt: "desc" },
    })

    return Response.json({ numbers })
  } catch (err) {
    console.error("[GET /api/phone-numbers]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
