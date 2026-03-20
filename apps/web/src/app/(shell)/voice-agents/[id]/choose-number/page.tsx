import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma, PhoneNumberStatus } from '@voicecraft/db'
import { canProvisionNumbers } from '@/lib/twilio'
import { ChooseNumberClient } from '@/components/agents/ChooseNumberClient'

interface PageProps {
  params: Promise<{ id: string }>
}

export const metadata = { title: 'Choose a Number' }

export default async function ChooseNumberPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { id } = await params

  const [agent, poolNumbers] = await Promise.all([
    prisma.agent.findUnique({
      where: { id },
      select: { id: true, name: true, userId: true, phoneNumber: true },
    }),
    prisma.phoneNumber.findMany({
      where: { userId: session.user.id, status: PhoneNumberStatus.AVAILABLE },
      select: { id: true, number: true, areaCode: true },
      orderBy: { releasedAt: 'desc' },
    }),
  ])

  if (!agent) notFound()
  if (agent.userId !== session.user.id) notFound()

  // If agent already has a number, redirect to detail page
  if (agent.phoneNumber) {
    redirect(`/voice-agents/${id}`)
  }

  const canProvision = canProvisionNumbers()

  return (
    <ChooseNumberClient
      agentId={agent.id}
      agentName={agent.name}
      canProvision={canProvision}
      poolNumbers={poolNumbers}
    />
  )
}
