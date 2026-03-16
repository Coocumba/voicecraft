import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { NewVoiceAgentClient } from '@/components/builder/NewVoiceAgentClient'

export const metadata = { title: 'New Agent — VoiceCraft' }

interface PageProps {
  searchParams: Promise<{
    business?: string
  }>
}

export default async function NewVoiceAgentPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const params = await searchParams
  const business = params.business ? decodeURIComponent(params.business) : undefined

  return (
    <NewVoiceAgentClient
      initialMessage={business}
    />
  )
}
