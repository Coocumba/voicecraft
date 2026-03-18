import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma, AgentStatus } from '@voicecraft/db'
import { ServiceCard } from '@/components/ui/ServiceCard'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Dashboard' }

export default async function DashboardHomePage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const [agentCount, activeAgentCount, weekCallCount] = await Promise.all([
    prisma.agent.count({ where: { userId: session.user.id } }),
    prisma.agent.count({ where: { userId: session.user.id, status: AgentStatus.ACTIVE } }),
    prisma.call.count({
      where: {
        agent: { userId: session.user.id },
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    }),
  ])

  const firstName = session.user?.name?.split(' ')[0] ?? 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const voiceAgentsStats =
    agentCount > 0
      ? `${activeAgentCount} active · ${weekCallCount} calls this week`
      : undefined

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-serif text-2xl sm:text-3xl text-ink">
          {greeting}, {firstName}
        </h1>
        <p className="text-sm text-muted mt-1">What would you like to set up today?</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ServiceCard
          emoji="🎙"
          label="Voice Agents"
          description="Handle inbound calls automatically for any business."
          href="/dashboard/voice-agents"
          available={true}
          stats={voiceAgentsStats}
          ctaLabel={agentCount > 0 ? 'Open' : 'Get started'}
        />
        <ServiceCard
          emoji="💬"
          label="SMS Bot"
          description="Respond to customer texts automatically."
          href="#"
          available={false}
          ctaLabel="Coming soon"
        />
        <ServiceCard
          emoji="🪟"
          label="Chat Widget"
          description="Embed an AI chat assistant on your website."
          href="#"
          available={false}
          ctaLabel="Coming soon"
        />
      </div>
    </div>
  )
}
