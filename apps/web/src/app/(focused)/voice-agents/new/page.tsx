import { getSession } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma, AgentStatus } from '@voicecraft/db'
import { getEffectiveMaxAgents } from '@/lib/plans'
import { NewVoiceAgentClient } from '@/components/builder/NewVoiceAgentClient'

export const metadata = { title: 'New Agent' }

interface PageProps {
  searchParams: Promise<{
    business?: string
  }>
}

export default async function NewVoiceAgentPage({ searchParams }: PageProps) {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')

  // Check agent limit before showing the builder
  const [activeAgentCount, subscription] = await Promise.all([
    prisma.agent.count({
      where: { userId: session.user.id, status: { not: AgentStatus.INACTIVE } },
    }),
    prisma.subscription.findUnique({
      where: { userId: session.user.id },
      include: { plan: true },
    }),
  ])

  const maxAgents = await getEffectiveMaxAgents(subscription)
  if (activeAgentCount >= maxAgents) {
    redirect('/voice-agents')
  }

  const params = await searchParams
  const business = params.business ? decodeURIComponent(params.business) : undefined

  return (
    <NewVoiceAgentClient
      initialMessage={business}
    />
  )
}
