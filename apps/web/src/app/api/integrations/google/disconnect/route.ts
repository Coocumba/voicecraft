// Remove the authenticated user's Google Calendar integration.
// DELETE /api/integrations/google/disconnect
//
// Returns 200 on success, 404 if no integration exists.

import { auth } from "@/auth"
import { prisma, IntegrationProvider } from "@voicecraft/db"

export async function DELETE(): Promise<Response> {
  const session = await auth()
  const userId = session?.user?.id

  if (!session?.user || !userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Check whether the integration exists before attempting to delete.
  const existing = await prisma.integration.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: IntegrationProvider.GOOGLE_CALENDAR,
      },
    },
    select: { id: true },
  })

  if (!existing) {
    return Response.json({ error: "Not connected" }, { status: 404 })
  }

  await prisma.integration.delete({
    where: {
      userId_provider: {
        userId,
        provider: IntegrationProvider.GOOGLE_CALENDAR,
      },
    },
  })

  return Response.json({ success: true })
}
