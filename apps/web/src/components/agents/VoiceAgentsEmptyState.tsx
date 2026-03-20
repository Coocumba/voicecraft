'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const EXAMPLE_PROMPTS = [
  'A dental clinic',
  'A hair salon',
  'A law firm',
  'A bakery',
  'A gym',
  'A plumbing company',
]

export function VoiceAgentsEmptyState() {
  const router = useRouter()
  const [value, setValue] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    router.push(`/voice-agents/new?business=${encodeURIComponent(trimmed)}`)
  }

  function handleExampleClick(prompt: string) {
    setValue(prompt)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] px-4 pb-16">
      <h1 className="font-serif text-2xl sm:text-3xl text-ink mb-3 text-center">
        Tell me about your business
      </h1>
      <p className="text-sm text-muted mb-8 text-center max-w-sm">
        Describe your business and I&apos;ll set up a voice agent tailored for you.
      </p>

      <form onSubmit={handleSubmit} className="w-full max-w-xl">
        <div className="flex gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="A dental clinic, a bakery, a gym…"
            className="flex-1 px-5 py-4 rounded-xl border border-border bg-white text-ink text-base focus:ring-2 focus:ring-accent focus:border-transparent outline-none"
            autoFocus
          />
          <button
            type="submit"
            disabled={!value.trim()}
            className="px-5 py-4 bg-accent text-white rounded-xl font-medium hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            aria-label="Get started"
          >
            →
          </button>
        </div>
      </form>

      <div className="flex flex-wrap gap-2 mt-4 justify-center max-w-xl">
        {EXAMPLE_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => handleExampleClick(prompt)}
            className="text-sm text-muted hover:text-ink hover:bg-white px-3 py-1.5 rounded-lg border border-transparent hover:border-border transition-all"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  )
}
