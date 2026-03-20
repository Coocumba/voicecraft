import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@voicecraft/db'
import { TestCallClient } from '@/components/agents/TestCallClient'

interface PageProps {
  params: Promise<{ id: string }>
}

export const metadata = { title: 'Test Call' }

export default async function VoiceAgentTestPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { id } = await params
  const agent = await prisma.agent.findUnique({ where: { id } })

  if (!agent || agent.userId !== session.user.id) notFound()

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <Link
          href={`/dashboard/voice-agents/${agent.id}`}
          className="text-xs text-muted hover:text-ink transition-colors inline-flex items-center gap-1 mb-4"
        >
          <span aria-hidden="true">←</span> {agent.name}
        </Link>
        <h1 className="font-serif text-2xl text-ink">Test Call</h1>
        <p className="text-sm text-muted mt-1">
          Your agent will answer as if a real customer called. Say anything to test it.
        </p>
      </div>

      <TestCallClient
        agent={{
          id: agent.id,
          name: agent.name,
          businessName: agent.businessName,
          status: agent.status,
        }}
      />

      {/* Post-test actions */}
      <div className="mt-8 pt-6 border-t border-border">
        <p className="text-sm text-muted mb-4">After your test call:</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href={`/dashboard/voice-agents/${agent.id}?tested=true`}
            className="inline-flex items-center justify-center bg-accent text-white px-4 py-2 rounded-lg text-sm hover:bg-accent/90 font-medium transition-colors"
          >
            👍 Looks good — Deploy it
          </Link>
          <Link
            href={`/dashboard/voice-agents/${agent.id}/edit`}
            className="inline-flex items-center justify-center bg-white border border-border text-ink px-4 py-2 rounded-lg text-sm hover:bg-cream font-medium transition-colors"
          >
            💬 Something needs changing
          </Link>
        </div>
      </div>
    </div>
  )
}
