'use client'

import { useRouter } from 'next/navigation'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function NewAgentError({ reset }: ErrorProps) {
  const router = useRouter()

  function handleReset() {
    router.refresh()
    reset()
  }
  return (
    <div className="flex flex-col h-screen items-center justify-center p-6">
      <p className="font-serif text-lg text-ink mb-2">Something went wrong</p>
      <p className="text-sm text-muted mb-4">Please try again or refresh the page.</p>
      <button
        onClick={handleReset}
        className="text-sm text-accent hover:text-accent/80 font-medium transition-colors"
      >
        Try again
      </button>
    </div>
  )
}
