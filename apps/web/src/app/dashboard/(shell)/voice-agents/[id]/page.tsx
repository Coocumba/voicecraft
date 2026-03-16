import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/auth'
import { prisma, AgentStatus, CallOutcome } from '@voicecraft/db'
import { formatDate, formatDateTime, formatDuration } from '@/lib/date-utils'
import { DeployButton } from '@/components/agents/DeployButton'
import { EditPhoneNumber } from '@/components/agents/EditPhoneNumber'
import { GuidedNextSteps } from '@/components/agents/GuidedNextSteps'
import { CollapsibleConfig } from '@/components/agents/CollapsibleConfig'
import type { AgentConfig } from '@/lib/builder-types'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ new?: string; tested?: string }>
}

function isAgentConfig(value: unknown): value is AgentConfig {
  return typeof value === 'object' && value !== null
}

function statusBadgeClass(status: AgentStatus) {
  switch (status) {
    case AgentStatus.ACTIVE: return 'bg-success/10 text-success'
    case AgentStatus.INACTIVE: return 'bg-red-100 text-red-700'
    default: return 'bg-muted/15 text-muted'
  }
}

function statusLabel(status: AgentStatus) {
  switch (status) {
    case AgentStatus.ACTIVE: return 'Active'
    case AgentStatus.INACTIVE: return 'Inactive'
    default: return 'Draft'
  }
}

function outcomeBadgeClass(outcome: CallOutcome) {
  switch (outcome) {
    case CallOutcome.COMPLETED: return 'bg-success/10 text-success'
    case CallOutcome.MISSED: return 'bg-muted/15 text-muted'
    case CallOutcome.ESCALATED: return 'bg-accent/10 text-accent'
    default: return 'bg-muted/15 text-muted'
  }
}

function outcomeLabel(outcome: CallOutcome) {
  switch (outcome) {
    case CallOutcome.COMPLETED: return 'Completed'
    case CallOutcome.MISSED: return 'Missed'
    case CallOutcome.ESCALATED: return 'Escalated'
    default: return outcome
  }
}

export default async function VoiceAgentDetailPage({ params, searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { id } = await params
  const { new: isNew, tested: isTested } = await searchParams

  const [agent, escalatedCount] = await Promise.all([
    prisma.agent.findUnique({
      where: { id },
      include: {
        calls: { orderBy: { createdAt: 'desc' }, take: 20 },
        _count: { select: { calls: true, appointments: true } },
      },
    }),
    prisma.call.count({
      where: { agentId: id, outcome: CallOutcome.ESCALATED },
    }),
  ])

  if (!agent) notFound()
  if (agent.userId !== session.user.id) notFound()

  const config = isAgentConfig(agent.config) ? agent.config : null
  const isDraft = agent.status === AgentStatus.DRAFT

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">

      {/* Guided next steps — shown after creation (?new=true) or after testing (?tested=true) */}
      {(isNew === 'true' || isTested === 'true') && (
        <GuidedNextSteps agentId={agent.id} agentName={agent.name} hasTested={isTested === 'true'} />
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <Link
            href="/dashboard/voice-agents"
            className="text-xs text-muted hover:text-ink transition-colors mb-2 inline-flex items-center gap-1"
          >
            <span aria-hidden="true">←</span> Voice Agents
          </Link>
          <div className="flex items-center gap-3 mt-1">
            <h1 className="font-serif text-2xl sm:text-3xl text-ink">{agent.name}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadgeClass(agent.status)}`}>
              {statusLabel(agent.status)}
            </span>
          </div>
          {agent.businessName !== agent.name && (
            <p className="text-sm text-muted mt-1">{agent.businessName}</p>
          )}
          <p className="text-xs text-muted mt-0.5">Created {formatDate(agent.createdAt)}</p>
        </div>

        <div id="agent-header-actions" className="flex items-center gap-2 flex-shrink-0">
          <Link
            href={`/dashboard/voice-agents/${agent.id}/test`}
            className="bg-white text-ink px-4 py-2 rounded-lg text-sm border border-border hover:bg-cream font-medium transition-colors"
          >
            Test Call
          </Link>
          <DeployButton agentId={agent.id} currentStatus={agent.status} />
        </div>
      </div>

      {/* Undeployed nudge — links to the header DeployButton (single source of truth) */}
      {isDraft && (
        <div id="deploy-section" className="flex items-center justify-between bg-accent/5 border border-accent/20 rounded-xl px-5 py-3 text-sm text-accent mb-6">
          <span>This agent isn&apos;t live yet.</span>
          <a
            href="#agent-header-actions"
            className="text-accent font-medium hover:text-accent/80 transition-colors whitespace-nowrap"
          >
            Deploy now →
          </a>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-border p-5">
          <p className="text-xs text-muted font-medium mb-1">Total Calls</p>
          <p className="font-serif text-3xl text-ink">{agent._count.calls}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-5">
          <p className="text-xs text-muted font-medium mb-1">Appointments</p>
          <p className="font-serif text-3xl text-ink">{agent._count.appointments}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-5">
          <p className="text-xs text-muted font-medium mb-1">Escalated</p>
          <p className="font-serif text-3xl text-ink">{escalatedCount}</p>
        </div>
      </div>

      {/* Phone number */}
      <div className="bg-white rounded-xl border border-border p-5 mb-8">
        <p className="text-xs text-muted font-medium mb-2">Phone Number</p>
        <EditPhoneNumber agentId={agent.id} currentNumber={agent.phoneNumber} />
      </div>

      {/* Collapsible config */}
      {config && (
        <div className="mb-8">
          <CollapsibleConfig config={config} />
        </div>
      )}

      {/* Call history */}
      <section>
        <h2 className="font-serif text-lg text-ink mb-4">Call History</h2>
        {agent.calls.length === 0 ? (
          <div className="bg-white rounded-xl border border-border p-10 text-center">
            <p className="text-sm text-muted">No calls recorded yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Date</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Caller</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Duration</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {agent.calls.map((call) => (
                    <tr key={call.id} className="hover:bg-cream/50 transition-colors">
                      <td className="px-5 py-3 text-ink whitespace-nowrap">{formatDateTime(call.createdAt)}</td>
                      <td className="px-5 py-3 text-muted">{call.callerNumber ?? 'Unknown'}</td>
                      <td className="px-5 py-3 text-muted">{call.duration != null ? formatDuration(call.duration) : '—'}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${outcomeBadgeClass(call.outcome)}`}>
                          {outcomeLabel(call.outcome)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
