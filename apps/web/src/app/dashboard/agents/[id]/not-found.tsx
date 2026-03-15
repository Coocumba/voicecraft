import Link from 'next/link'

export default function AgentNotFound() {
  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto flex items-center justify-center min-h-[60vh]">
      <div className="bg-white rounded-xl border border-border p-10 text-center max-w-md w-full">
        {/* Illustration */}
        <div className="w-14 h-14 rounded-full bg-muted/10 flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-7 h-7 text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
            />
          </svg>
        </div>

        <h2 className="font-serif text-xl text-ink mb-2">Agent not found</h2>
        <p className="text-sm text-muted mb-8 leading-relaxed">
          This agent doesn&apos;t exist or you don&apos;t have access to it.
          It may have been deleted, or you may have followed an outdated link.
        </p>

        <Link
          href="/dashboard/agents"
          className="inline-flex items-center gap-2 bg-accent hover:bg-accent/90 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Back to Agents
        </Link>
      </div>
    </div>
  )
}
