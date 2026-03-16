import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@voicecraft/db'
import { NewVoiceAgentClient } from '@/components/builder/NewVoiceAgentClient'

export const metadata = { title: 'Edit Agent — VoiceCraft' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditVoiceAgentPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { id } = await params
  const agent = await prisma.agent.findUnique({ where: { id } })

  if (!agent || agent.userId !== session.user.id) notFound()

  return (
    <NewVoiceAgentClient
      conversationId={agent.conversationId ?? undefined}
      agentId={agent.id}
      agentName={agent.name}
      editMode
    />
  )
}
