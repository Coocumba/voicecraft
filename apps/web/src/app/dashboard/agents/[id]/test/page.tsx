import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@voicecraft/db'
import { TestCallClient } from '@/components/agents/TestCallClient'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function TestCallPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { id } = await params

  const agent = await prisma.agent.findUnique({ where: { id } })

  if (!agent || agent.userId !== session.user.id) notFound()

  return (
    <TestCallClient
      agent={{
        id: agent.id,
        name: agent.name,
        businessName: agent.businessName,
        status: agent.status,
      }}
    />
  )
}
