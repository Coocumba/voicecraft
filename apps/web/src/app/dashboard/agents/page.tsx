import Link from 'next/link'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma, AgentStatus } from '@voicecraft/db'
import { formatDate } from '@/lib/date-utils'

function statusBadgeClass(status: AgentStatus) {
  switch (status) {
    case AgentStatus.ACTIVE:
      return 'bg-success/10 text-success'
    case AgentStatus.INACTIVE:
      return 'bg-red-100 text-red-700'
    default:
      return 'bg-muted/15 text-muted'
  }
}

function statusLabel(status: AgentStatus) {
  switch (status) {
    case AgentStatus.ACTIVE:
      return 'Active'
    case AgentStatus.INACTIVE:
      return 'Inactive'
    default:
      return 'Draft'
  }
}

export default async function AgentsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const agents = await prisma.agent.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-serif text-2xl sm:text-3xl text-ink">Your Agents</h1>
        <Link
          href="/dashboard/agents/new"
          className="bg-accent text-white px-4 py-2 rounded-lg text-sm hover:bg-accent/90 font-medium transition-colors"
        >
          New Agent
        </Link>
      </div>

      {agents.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          <p className="font-serif text-lg text-ink mb-2">No agents yet</p>
          <p className="text-sm text-muted mb-6">
            Create your first voice agent to start handling calls.
          </p>
          <Link
            href="/dashboard/agents/new"
            className="inline-flex bg-accent text-white px-4 py-2 rounded-lg text-sm hover:bg-accent/90 font-medium transition-colors"
          >
            Create your first agent
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map((agent) => (
            <Link
              key={agent.id}
              href={`/dashboard/agents/${agent.id}`}
              className="bg-white rounded-xl border border-border p-6 hover:border-accent/40 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0 flex-1">
                  <h2 className="font-medium text-ink group-hover:text-accent transition-colors truncate">
                    {agent.name}
                  </h2>
                  <p className="text-sm text-muted truncate mt-0.5">{agent.businessName}</p>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ml-3 ${statusBadgeClass(agent.status)}`}
                >
                  {statusLabel(agent.status)}
                </span>
              </div>
              <p className="text-xs text-muted mt-4">
                Created {formatDate(agent.createdAt)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
