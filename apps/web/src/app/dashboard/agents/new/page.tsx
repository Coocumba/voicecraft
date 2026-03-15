import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { BuilderChat } from '@/components/builder/BuilderChat'

export const metadata = {
  title: 'New Agent',
}

export default async function NewAgentPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  return (
    <div className="flex flex-col h-screen p-6 sm:p-8">
      <div className="mb-4 flex-shrink-0">
        <h1 className="font-serif text-2xl sm:text-3xl text-ink">New Agent</h1>
        <p className="text-sm text-muted mt-1">
          Chat with the assistant to configure your voice agent step by step.
        </p>
      </div>
      <div className="flex-1 min-h-0">
        <BuilderChat />
      </div>
    </div>
  )
}
