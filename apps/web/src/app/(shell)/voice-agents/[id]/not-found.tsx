import Link from 'next/link'

export default function AgentNotFound() {
  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto text-center py-20">
      <h1 className="font-serif text-2xl text-ink mb-2">Agent not found</h1>
      <p className="text-sm text-muted mb-6">
        This agent doesn&apos;t exist or you don&apos;t have access.
      </p>
      <Link
        href="/voice-agents"
        className="text-sm text-accent hover:text-accent/80 font-medium"
      >
        ← Back to Voice Agents
      </Link>
    </div>
  )
}
