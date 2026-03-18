import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma, SmsConversationStatus } from '@voicecraft/db'
import { MessagesClient } from '@/components/messages/MessagesClient'

export default async function MessagesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  // Find all SMS-enabled agents for this user
  const smsAgents = await prisma.agent.findMany({
    where: { userId: session.user.id, smsEnabled: true },
    select: { id: true, name: true, businessName: true },
  })

  if (smsAgents.length === 0) {
    return (
      <div className="p-6 sm:p-8 max-w-5xl mx-auto">
        <h1 className="font-serif text-2xl sm:text-3xl text-ink mb-6">Messages</h1>
        <div className="bg-white rounded-xl border border-border p-10 text-center">
          <p className="text-sm text-muted">
            No agents have text messages enabled yet. Enable SMS on an agent&apos;s detail page to start receiving messages.
          </p>
        </div>
      </div>
    )
  }

  // Fetch conversations for all SMS-enabled agents
  const conversations = await prisma.smsConversation.findMany({
    where: {
      agentId: { in: smsAgents.map((a) => a.id) },
    },
    orderBy: { lastMessageAt: 'desc' },
    include: {
      agent: { select: { id: true, name: true, businessName: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { body: true, sender: true, createdAt: true },
      },
    },
  })

  // Sort: NEEDS_REPLY first, then by lastMessageAt desc
  const sorted = [...conversations].sort((a, b) => {
    if (a.status === SmsConversationStatus.NEEDS_REPLY && b.status !== SmsConversationStatus.NEEDS_REPLY) return -1
    if (b.status === SmsConversationStatus.NEEDS_REPLY && a.status !== SmsConversationStatus.NEEDS_REPLY) return 1
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  })

  // Serialize dates for client component
  const serialized = sorted.map((c) => ({
    id: c.id,
    agentId: c.agentId,
    customerPhone: c.customerPhone,
    status: c.status,
    lastMessageAt: c.lastMessageAt.toISOString(),
    agentName: c.agent.name,
    lastMessage: c.messages[0]
      ? {
          body: c.messages[0].body,
          sender: c.messages[0].sender,
          createdAt: c.messages[0].createdAt.toISOString(),
        }
      : null,
  }))

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      <h1 className="font-serif text-2xl sm:text-3xl text-ink mb-6">Messages</h1>
      <MessagesClient
        conversations={serialized}
        agents={smsAgents}
      />
    </div>
  )
}
