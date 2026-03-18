import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/auth'
import { prisma, IntegrationProvider } from '@voicecraft/db'
import type { AgentConfig } from '@/lib/builder-types'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ConnectCalendarPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { id } = await params

  const [agent, integration] = await Promise.all([
    prisma.agent.findUnique({
      where: { id },
      select: { id: true, name: true, userId: true, config: true },
    }),
    prisma.integration.findFirst({
      where: { userId: session.user.id, provider: IntegrationProvider.GOOGLE_CALENDAR },
      select: { id: true },
    }),
  ])

  if (!agent) notFound()
  if (agent.userId !== session.user.id) notFound()

  const config = (typeof agent.config === 'object' && agent.config !== null ? agent.config : {}) as AgentConfig

  // Skip interstitial if calendar already connected or agent doesn't book
  if (integration || config.can_book_appointments !== true) {
    redirect(`/dashboard/voice-agents/${id}?new=true`)
  }

  const returnTo = encodeURIComponent(`/dashboard/voice-agents/${id}?new=true`)

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="max-w-lg w-full text-center">
        <h1 className="font-serif text-2xl sm:text-3xl text-ink mb-3">Connect your calendar</h1>
        <p className="text-sm text-muted mb-8 max-w-md mx-auto">
          {agent.name} books appointments. Connect Google Calendar so it uses your real
          availability — otherwise it&apos;ll offer placeholder time slots that may conflict
          with your schedule.
        </p>
        <div className="space-y-3">
          <a
            href={`/api/integrations/google?returnTo=${returnTo}`}
            className="inline-flex bg-accent text-white px-6 py-2.5 rounded-lg text-sm hover:bg-accent/90 font-medium transition-colors"
          >
            Connect Google Calendar
          </a>
          <div>
            <Link
              href={`/dashboard/voice-agents/${id}?new=true`}
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
