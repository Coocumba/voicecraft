import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/auth'
import { prisma, IntegrationProvider } from '@voicecraft/db'
import type { AgentConfig } from '@/lib/builder-types'
import { CalendarConnectButtons } from '@/components/integrations/CalendarConnectButtons'

interface PageProps {
  params: Promise<{ id: string }>
}

export const metadata = { title: 'Connect Calendar' }

export default async function ConnectCalendarPage({ params }: PageProps) {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')

  const { id } = await params

  const [agent, integration] = await Promise.all([
    prisma.agent.findUnique({
      where: { id },
      select: { id: true, name: true, userId: true, config: true },
    }),
    prisma.integration.findFirst({
      where: {
        userId: session.user.id,
        provider: { in: [IntegrationProvider.GOOGLE_CALENDAR, IntegrationProvider.MICROSOFT_OUTLOOK] },
      },
      select: { id: true },
    }),
  ])

  if (!agent) notFound()
  if (agent.userId !== session.user.id) notFound()

  const config = (typeof agent.config === 'object' && agent.config !== null ? agent.config : {}) as AgentConfig

  // Skip interstitial if calendar already connected or agent doesn't book
  if (integration || config.can_book_appointments !== true) {
    redirect(`/voice-agents/${id}?new=true`)
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="max-w-lg w-full text-center">
        <h1 className="font-serif text-2xl sm:text-3xl text-ink mb-3">Connect your calendar</h1>
        <p className="text-sm text-muted mb-8 max-w-md mx-auto">
          {agent.name} books appointments. Connect your calendar so it uses your real
          availability — otherwise it&apos;ll offer placeholder time slots that may conflict
          with your schedule.
        </p>
        <div className="space-y-3">
          <CalendarConnectButtons returnTo={`/voice-agents/${id}?new=true`} />
          <div>
            <Link
              href={`/voice-agents/${id}?new=true`}
              className="text-sm text-muted hover:text-ink transition-colors"
            >
              Skip for now →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
