// Check whether the authenticated user has connected Microsoft Outlook.
// GET /api/integrations/microsoft/status

import { auth } from "@/auth"
import { prisma, IntegrationProvider } from "@voicecraft/db"

interface StatusResponse {
  available: boolean
  connected: boolean
  email?: string
}

export async function GET(): Promise<Response> {
  const session = await auth()
  const userId = session?.user?.id

  if (!session?.user || !userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const available = !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET && process.env.NEXT_PUBLIC_APP_URL)

  if (!available) {
    const body: StatusResponse = { available: false, connected: false }
    return Response.json(body)
  }

  const integration = await prisma.integration.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: IntegrationProvider.MICROSOFT_OUTLOOK,
      },
    },
    select: {
      id: true,
      metadata: true,
    },
  })

  if (!integration) {
    const body: StatusResponse = { available: true, connected: false }
    return Response.json(body)
  }

  let email: string | undefined
  if (
    integration.metadata !== null &&
    typeof integration.metadata === "object" &&
    !Array.isArray(integration.metadata) &&
    "accountEmail" in integration.metadata &&
    typeof (integration.metadata as Record<string, unknown>).accountEmail === "string"
  ) {
    email = (integration.metadata as Record<string, string>).accountEmail
  }

  const body: StatusResponse = { available: true, connected: true, email }
  return Response.json(body)
}
