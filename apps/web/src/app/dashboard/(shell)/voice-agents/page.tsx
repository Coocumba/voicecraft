import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma, AgentStatus } from '@voicecraft/db'
import { formatDate } from '@/lib/date-utils'
import { VoiceAgentsEmptyState } from '@/components/agents/VoiceAgentsEmptyState'

export const metadata = { title: 'Voice Agents' }

function statusDotClass(status: AgentStatus) {
  switch (status) {
    case AgentStatus.ACTIVE:
      return 'text-success'
    case AgentStatus.INACTIVE:
      return 'text-red-500'
    default:
      return 'text-muted'
  }
}

function statusLabel(status: AgentStatus) {
  switch (status) {
    case AgentStatus.ACTIVE: return 'Active'
    case AgentStatus.INACTIVE: return 'Inactive'
    default: return 'Draft'
  }
}

export default async function VoiceAgentsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const agents = await prisma.agent.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { calls: true, appointments: true } },
    },
  })

  if (agents.length === 0) {
    return <VoiceAgentsEmptyState />
  }

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-8">
        <h1 className="font-serif text-2xl sm:text-3xl text-ink">Voice Agents</h1>
        <Link
          href="/dashboard/voice-agents/new"
          className="bg-accent text-white px-4 py-2 rounded-lg text-sm hover:bg-accent/90 font-medium transition-colors"
        >
          + New Agent
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => {
          const isDraft = agent.status === AgentStatus.DRAFT
          return (
            <Link
              key={agent.id}
              href={`/dashboard/voice-agents/${agent.id}`}
              className="bg-white rounded-xl border border-border p-6 hover:border-accent/40 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0 flex-1">
                  <h2 className="font-medium text-ink group-hover:text-accent transition-colors truncate">
                    {agent.name}
                  </h2>
                  {agent.businessName !== agent.name && (
                    <p className="text-sm text-muted truncate mt-0.5">{agent.businessName}</p>
                  )}
                </div>
              </div>

              {isDraft ? (
                <p className="text-xs text-accent mt-3">→ Test &amp; deploy</p>
              ) : (
                <p className="text-xs text-muted mt-3">
                  {agent._count.calls} calls · {agent._count.appointments} appts
                </p>
              )}

              <div className="flex items-center justify-between mt-4">
                <span className={`text-xs font-medium ${statusDotClass(agent.status)}`}>
                  {statusLabel(agent.status)}
                </span>
                <span className="text-xs text-muted">{formatDate(agent.createdAt)}</span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
