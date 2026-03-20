'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

interface DashboardErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  const router = useRouter()

  useEffect(() => {
    // Log to an error reporting service in production
    console.error('[Dashboard error]', error)
  }, [error])

  function handleReset() {
    router.refresh()
    reset()
  }

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto flex items-center justify-center min-h-[60vh]">
      <div className="bg-white rounded-xl border border-border p-8 text-center max-w-md w-full">
        {/* Icon */}
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-5">
          <svg
            className="w-6 h-6 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>

        <h2 className="font-serif text-xl text-ink mb-2">Something went wrong</h2>
        <p className="text-sm text-muted mb-6 leading-relaxed">
          We ran into an unexpected problem loading this page. This has been
          noted and we&apos;ll look into it. Please try again.
        </p>

        <button
          onClick={handleReset}
          className="bg-accent hover:bg-accent/90 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}
