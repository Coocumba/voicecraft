// Remove the authenticated user's Microsoft Outlook integration.
// DELETE /api/integrations/microsoft/disconnect

import { auth } from "@/auth"
import { prisma, IntegrationProvider } from "@voicecraft/db"

export async function DELETE(): Promise<Response> {
  const session = await auth()
  const userId = session?.user?.id

  if (!session?.user || !userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const existing = await prisma.integration.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: IntegrationProvider.MICROSOFT_OUTLOOK,
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
        provider: IntegrationProvider.MICROSOFT_OUTLOOK,
      },
    },
  })

  return Response.json({ success: true })
}
