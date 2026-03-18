import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/auth'
import { prisma, AgentStatus, CallOutcome, PhoneNumberStatus, IntegrationProvider } from '@voicecraft/db'
import { formatDate, formatDateTime, formatDuration } from '@/lib/date-utils'
import { canProvisionNumbers } from '@/lib/twilio'
import { DeployButton } from '@/components/agents/DeployButton'
import { PhoneNumberCard } from '@/components/agents/PhoneNumberCard'
import { GuidedNextSteps } from '@/components/agents/GuidedNextSteps'
import { CollapsibleConfig } from '@/components/agents/CollapsibleConfig'
import { DeleteAgentButton } from '@/components/agents/DeleteAgentButton'
import { CallForwardingGuide } from '@/components/agents/CallForwardingGuide'
import { SmsToggleCard } from '@/components/agents/SmsToggleCard'
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

  const [agent, escalatedCount, poolNumbers, otherAgentsWithoutNumber, googleCalendarIntegration] = await Promise.all([
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
    prisma.phoneNumber.findMany({
      where: { userId: session.user.id, status: PhoneNumberStatus.AVAILABLE },
      select: { id: true, number: true, areaCode: true },
      orderBy: { releasedAt: 'desc' },
    }),
    prisma.agent.findMany({
      where: { userId: session.user.id, id: { not: id }, phoneNumber: null },
      select: { id: true, name: true },
    }),
    prisma.integration.findFirst({
      where: { userId: session.user.id, provider: IntegrationProvider.GOOGLE_CALENDAR },
      select: { id: true },
    }),
  ])

  if (!agent) notFound()
  if (agent.userId !== session.user.id) notFound()

  const config = isAgentConfig(agent.config) ? agent.config : null
  const isDraft = agent.status === AgentStatus.DRAFT
  const hasGoogleCalendar = !!googleCalendarIntegration
  const needsCalendar = config?.can_book_appointments === true && !hasGoogleCalendar
  const needsSms = config?.can_book_appointments === true && !!agent.phoneNumber && !agent.smsEnabled

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">

      {/* Guided next steps — shown after creation (?new=true) or after testing (?tested=true) */}
      {(isNew === 'true' || isTested === 'true') && (
        <GuidedNextSteps agentId={agent.id} agentName={agent.name} hasTested={isTested === 'true'} needsCalendar={needsCalendar} needsSms={needsSms} />
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
          <DeployButton agentId={agent.id} currentStatus={agent.status} hasPhoneNumber={!!agent.phoneNumber} />
        </div>
      </div>

      {/* Undeployed nudge — context-aware: phone number first, then deploy */}
      {isDraft && (
        <div id="deploy-section" className="flex items-center justify-between bg-accent/5 border border-accent/20 rounded-xl px-5 py-3 text-sm text-accent mb-6">
          <span>{agent.phoneNumber ? 'This agent isn\u0027t live yet.' : 'Add a phone number to go live.'}</span>
          <a
            href={agent.phoneNumber ? '#agent-header-actions' : '#phone-number-section'}
            className="text-accent font-medium hover:text-accent/80 transition-colors whitespace-nowrap"
          >
            {agent.phoneNumber ? 'Deploy now →' : 'Set up number →'}
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

      {/* Calendar warning banner */}
      {needsCalendar && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-sm text-amber-800 mb-8">
          <span>Your agent offers placeholder availability because Google Calendar isn&apos;t connected.</span>
          <a
            href={`/api/integrations/google?returnTo=${encodeURIComponent(`/dashboard/voice-agents/${agent.id}`)}`}
            className="text-accent font-medium hover:text-accent/80 transition-colors whitespace-nowrap ml-4"
          >
            Connect Google Calendar →
          </a>
        </div>
      )}

      {/* Phone number */}
      <div className="mb-8 space-y-4">
        <PhoneNumberCard
          agentId={agent.id}
          phoneNumber={agent.phoneNumber}
          phoneNumberSource={agent.phoneNumberSource}
          isActive={agent.status === AgentStatus.ACTIVE}
          canProvision={canProvisionNumbers()}
          poolNumbers={poolNumbers}
          otherAgentsWithoutNumber={otherAgentsWithoutNumber}
        />
        {agent.phoneNumber && agent.phoneNumberSource === 'provisioned' && (
          <CallForwardingGuide
            voicecraftNumber={agent.phoneNumber}
            agentId={agent.id}
          />
        )}
        {agent.phoneNumber && config?.can_book_appointments && (
          <SmsToggleCard
            agentId={agent.id}
            smsEnabled={agent.smsEnabled ?? false}
            hasPhoneNumber={!!agent.phoneNumber}
            canBookAppointments={config.can_book_appointments === true}
          />
        )}
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

      {/* Danger zone */}
      <div className="mt-12 pt-6 border-t border-red-100">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-ink">Delete this agent</p>
            <p className="text-xs text-muted mt-0.5">
              Permanently remove this agent{agent.phoneNumberSource === 'provisioned' ? ', release its phone number,' : ''} and all associated data.
            </p>
          </div>
          <DeleteAgentButton agentId={agent.id} agentName={agent.name} />
        </div>
      </div>
    </div>
  )
}
