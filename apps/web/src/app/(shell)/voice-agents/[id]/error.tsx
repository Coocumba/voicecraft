'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function AgentDetailError({ reset }: ErrorProps) {
  const router = useRouter()

  function handleReset() {
    router.refresh()
    reset()
  }
  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto text-center py-20">
      <p className="font-serif text-lg text-ink mb-2">Could not load agent</p>
      <p className="text-sm text-muted mb-6">Please refresh the page or try again.</p>
      <div className="flex items-center justify-center gap-4">
        <button onClick={handleReset} className="text-sm text-accent hover:text-accent/80 font-medium transition-colors">
          Try again
        </button>
        <Link href="/voice-agents" className="text-sm text-muted hover:text-ink transition-colors">
          ← Back to Voice Agents
        </Link>
      </div>
    </div>
  )
}
