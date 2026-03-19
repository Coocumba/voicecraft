import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@voicecraft/db'
import { CallsList } from '@/components/calls/CallsList'
import type { CallCardData } from '@/components/calls/CallCard'

export const metadata = { title: 'Calls' }

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export default async function CallsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id

  const now = new Date()
  const todayStart = startOfDay(now)
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  // Load everything in parallel
  const [calls, agents, todayCount, weekCount, totalCount] = await Promise.all([
    prisma.call.findMany({
      where: { agent: { userId } },
      include: {
        agent: { select: { id: true, name: true, businessName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.agent.findMany({
      where: { userId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.call.count({
      where: { agent: { userId }, createdAt: { gte: todayStart } },
    }),
    prisma.call.count({
      where: { agent: { userId }, createdAt: { gte: weekStart } },
    }),
    prisma.call.count({
      where: { agent: { userId } },
    }),
  ])

  // Batch look up contacts for all calls that have a callerNumber
  const phoneNumbers = [
    ...new Set(
      calls
        .map((c) => c.callerNumber)
        .filter((p): p is string => p !== null)
    ),
  ]

  const contacts =
    phoneNumbers.length > 0
      ? await prisma.contact.findMany({
          where: { userId, phone: { in: phoneNumbers } },
          select: { phone: true, name: true, callCount: true },
        })
      : []

  const contactByPhone = new Map(contacts.map((c) => [c.phone, c]))

  const callsWithContact: CallCardData[] = calls.map((call) => {
    const contact = call.callerNumber
      ? (contactByPhone.get(call.callerNumber) ?? null)
      : null
    return {
      id: call.id,
      callerNumber: call.callerNumber,
      duration: call.duration,
      outcome: call.outcome as CallCardData['outcome'],
      transcript: call.transcript,
      summary: call.summary,
      createdAt: call.createdAt.toISOString(),
      contactName: contact?.name ?? null,
      isReturningCaller: (contact?.callCount ?? 0) > 1,
      agent: call.agent,
    }
  })

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-serif text-2xl sm:text-3xl text-ink">Calls</h1>
        <p className="text-sm text-muted mt-1">
          A record of every call handled by your voice agents.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-border p-5">
          <p className="text-xs text-muted font-medium mb-1">Today</p>
          <p className="font-serif text-3xl text-ink">{todayCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-5">
          <p className="text-xs text-muted font-medium mb-1">This Week</p>
          <p className="font-serif text-3xl text-ink">{weekCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-5">
          <p className="text-xs text-muted font-medium mb-1">Total</p>
          <p className="font-serif text-3xl text-ink">{totalCount}</p>
        </div>
      </div>

      {/* Interactive calls list with filters */}
      <CallsList calls={callsWithContact} agents={agents} />
    </div>
  )
}
