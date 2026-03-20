import { auth } from "@/auth"
import { prisma } from "@voicecraft/db"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  try {
    const call = await prisma.call.findFirst({
      where: {
        id,
        agent: { userId: session.user.id },
      },
      select: {
        id: true,
        transcript: true,
        summary: true,
      },
    })

    if (!call) {
      return Response.json({ error: "Not found" }, { status: 404 })
    }

    return Response.json({ transcript: call.transcript, summary: call.summary })
  } catch (err) {
    console.error("[GET /api/calls/[id]]", err)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
