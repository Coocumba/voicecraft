import { notFound } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma, AgentStatus, CallOutcome } from '@voicecraft/db'
import { formatDate, formatDateTime, formatDuration } from '@/lib/date-utils'
import { DeployButton } from '@/components/agents/DeployButton'
import { EditPhoneNumber } from '@/components/agents/EditPhoneNumber'

interface PageProps {
  params: Promise<{ id: string }>
}

// ---------------------------------------------------------------------------
// Config shape (as stored from the builder generate endpoint)
// ---------------------------------------------------------------------------
interface DayHours {
  open: string
  close: string
}

interface ServiceItem {
  name: string
  duration: number
  price: number
}

interface AgentConfig {
  business_name?: string
  hours?: Record<string, DayHours | null>
  services?: ServiceItem[]
  tone?: string
  language?: string
  greeting?: string
  escalation_rules?: string[]
}

function isAgentConfig(value: unknown): value is AgentConfig {
  return typeof value === 'object' && value !== null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

function outcomeBadgeClass(outcome: CallOutcome) {
  switch (outcome) {
    case CallOutcome.COMPLETED:
      return 'bg-success/10 text-success'
    case CallOutcome.MISSED:
      return 'bg-muted/15 text-muted'
    case CallOutcome.ESCALATED:
      return 'bg-accent/10 text-accent'
    default:
      return 'bg-muted/15 text-muted'
  }
}

function outcomeLabel(outcome: CallOutcome) {
  switch (outcome) {
    case CallOutcome.COMPLETED:
      return 'Completed'
    case CallOutcome.MISSED:
      return 'Missed'
    case CallOutcome.ESCALATED:
      return 'Escalated'
    default:
      return outcome
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

const DAY_LABELS: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function AgentDetailPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { id } = await params

  const agent = await prisma.agent.findUnique({
    where: { id },
    include: {
      calls: {
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
      _count: {
        select: { calls: true, appointments: true },
      },
    },
  })

  if (!agent) notFound()
  if (agent.userId !== session.user.id) notFound()

  const config = isAgentConfig(agent.config) ? agent.config : null

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="font-serif text-2xl sm:text-3xl text-ink">{agent.name}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadgeClass(agent.status)}`}>
              {statusLabel(agent.status)}
            </span>
          </div>
          <p className="text-sm text-muted">{agent.businessName}</p>
          <p className="text-xs text-muted mt-1">Created {formatDate(agent.createdAt)}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href={`/dashboard/agents/${agent.id}/test`}
            className="bg-white text-ink px-4 py-2 rounded-lg text-sm border border-border hover:bg-cream font-medium transition-colors"
          >
            Test Call
          </Link>
          <DeployButton agentId={agent.id} currentStatus={agent.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Stats */}
        <div className="bg-white rounded-xl border border-border p-5">
          <p className="text-xs text-muted font-medium mb-1">Total Calls</p>
          <p className="font-serif text-3xl text-ink">{agent._count.calls}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-5">
          <p className="text-xs text-muted font-medium mb-1">Appointments</p>
          <p className="font-serif text-3xl text-ink">{agent._count.appointments}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-5">
          <p className="text-xs text-muted font-medium mb-1">Phone Number</p>
          <div className="mt-1">
            <EditPhoneNumber agentId={agent.id} currentNumber={agent.phoneNumber} />
          </div>
        </div>
      </div>

      {/* Config summary */}
      {config && (
        <section className="mb-8">
          <h2 className="font-serif text-lg text-ink mb-4">Configuration</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Greeting */}
            {config.greeting && (
              <div className="bg-white rounded-xl border border-border p-5 md:col-span-2">
                <p className="text-xs text-muted font-semibold uppercase tracking-wider mb-2">Greeting</p>
                <p className="text-sm text-ink italic">&ldquo;{config.greeting}&rdquo;</p>
              </div>
            )}

            {/* Business info */}
            <div className="bg-white rounded-xl border border-border p-5">
              <p className="text-xs text-muted font-semibold uppercase tracking-wider mb-3">Details</p>
              <div className="space-y-2">
                {config.tone && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">Tone</span>
                    <span className="text-ink capitalize">{config.tone}</span>
                  </div>
                )}
                {config.language && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">Language</span>
                    <span className="text-ink uppercase">{config.language}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Services */}
            {config.services && config.services.length > 0 && (
              <div className="bg-white rounded-xl border border-border p-5">
                <p className="text-xs text-muted font-semibold uppercase tracking-wider mb-3">Services</p>
                <div className="space-y-2">
                  {config.services.map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-ink">{s.name}</span>
                      <span className="text-muted">{s.duration}min · ${s.price}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Hours */}
            {config.hours && (
              <div className="bg-white rounded-xl border border-border p-5">
                <p className="text-xs text-muted font-semibold uppercase tracking-wider mb-3">Business Hours</p>
                <div className="space-y-1.5">
                  {Object.entries(config.hours).map(([day, hours]) => (
                    <div key={day} className="flex items-center justify-between text-sm">
                      <span className="text-muted">{DAY_LABELS[day] ?? day}</span>
                      <span className="text-ink">
                        {hours ? `${hours.open} – ${hours.close}` : 'Closed'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Escalation rules */}
            {config.escalation_rules && config.escalation_rules.length > 0 && (
              <div className="bg-white rounded-xl border border-border p-5">
                <p className="text-xs text-muted font-semibold uppercase tracking-wider mb-3">Escalation Rules</p>
                <ul className="space-y-1.5">
                  {config.escalation_rules.map((rule, i) => (
                    <li key={i} className="text-sm text-ink flex gap-2">
                      <span className="text-muted flex-shrink-0">·</span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
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
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">
                      Caller
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">
                      Duration
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">
                      Outcome
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {agent.calls.map((call) => (
                    <tr key={call.id} className="hover:bg-cream/50 transition-colors">
                      <td className="px-5 py-3 text-ink whitespace-nowrap">
                        {formatDateTime(call.createdAt)}
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {call.callerNumber ?? 'Unknown'}
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {call.duration != null ? formatDuration(call.duration) : '—'}
                      </td>
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
