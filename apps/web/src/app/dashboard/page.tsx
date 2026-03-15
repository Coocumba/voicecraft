import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma, AgentStatus } from '@voicecraft/db'
import { formatDistanceToNow } from '@/lib/date-utils'

async function getOverviewStats(userId: string) {
  const [totalAgents, activeAgents, totalCalls, weekAppointments, recentCalls] =
    await Promise.all([
      prisma.agent.count({ where: { userId } }),
      prisma.agent.count({ where: { userId, status: AgentStatus.ACTIVE } }),
      prisma.call.count({ where: { agent: { userId } } }),
      prisma.appointment.count({
        where: {
          agent: { userId },
          scheduledAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      prisma.call.findMany({
        where: { agent: { userId } },
        include: { agent: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ])

  return { totalAgents, activeAgents, totalCalls, weekAppointments, recentCalls }
}

function outcomeLabel(outcome: string) {
  switch (outcome) {
    case 'COMPLETED':
      return 'Completed'
    case 'MISSED':
      return 'Missed'
    case 'ESCALATED':
      return 'Escalated'
    default:
      return outcome
  }
}

function outcomeBadgeClass(outcome: string) {
  switch (outcome) {
    case 'COMPLETED':
      return 'bg-success/10 text-success'
    case 'MISSED':
      return 'bg-muted/15 text-muted'
    case 'ESCALATED':
      return 'bg-accent/10 text-accent'
    default:
      return 'bg-muted/15 text-muted'
  }
}

interface StatCardProps {
  label: string
  value: number
  description?: string
}

function StatCard({ label, value, description }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-border p-6">
      <p className="text-sm text-muted font-medium">{label}</p>
      <p className="font-serif text-3xl text-ink mt-1">{value}</p>
      {description && (
        <p className="text-xs text-muted mt-1">{description}</p>
      )}
    </div>
  )
}

export default async function OverviewPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { totalAgents, activeAgents, totalCalls, weekAppointments, recentCalls } =
    await getOverviewStats(session.user.id)

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      <h1 className="font-serif text-2xl sm:text-3xl text-ink mb-8">Overview</h1>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <StatCard label="Total Agents" value={totalAgents} />
        <StatCard label="Active Agents" value={activeAgents} />
        <StatCard label="Total Calls" value={totalCalls} />
        <StatCard label="Appointments This Week" value={weekAppointments} />
      </div>

      {/* Recent activity */}
      <section>
        <h2 className="font-serif text-lg text-ink mb-4">Recent Activity</h2>

        {recentCalls.length === 0 ? (
          <div className="bg-white rounded-xl border border-border p-10 text-center">
            <p className="text-muted text-sm">No calls yet.</p>
            <p className="text-muted text-xs mt-1">
              Deploy an agent to start receiving calls.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border divide-y divide-border">
            {recentCalls.map((call) => (
              <div key={call.id} className="flex items-center justify-between px-5 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">
                    {call.agent.name}
                  </p>
                  <p className="text-xs text-muted mt-0.5">
                    {call.callerNumber ?? 'Unknown caller'}
                    {call.duration != null && (
                      <span className="ml-2">· {Math.floor(call.duration / 60)}m {call.duration % 60}s</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${outcomeBadgeClass(call.outcome)}`}
                  >
                    {outcomeLabel(call.outcome)}
                  </span>
                  <span className="text-xs text-muted whitespace-nowrap">
                    {formatDistanceToNow(call.createdAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
