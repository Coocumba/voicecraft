'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { formatPhone, formatLocation } from '@/lib/format-utils'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
  'DC',
] as const

interface PoolNumber {
  id: string
  number: string
  areaCode: string | null
}

interface AvailableNumber {
  phoneNumber: string
  friendlyName: string
  locality: string | null
  region: string | null
  postalCode: string | null
}

interface ChooseNumberClientProps {
  agentId: string
  agentName: string
  canProvision: boolean
  poolNumbers: PoolNumber[]
}

export function ChooseNumberClient({
  agentId,
  agentName,
  canProvision,
  poolNumbers,
}: ChooseNumberClientProps) {
  const router = useRouter()

  // Search form state
  const [areaCode, setAreaCode] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [pattern, setPattern] = useState('')

  // Results state
  const [results, setResults] = useState<AvailableNumber[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  // Selection state
  const [securingNumber, setSecuringNumber] = useState<string | null>(null)

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault()
    setIsSearching(true)
    setHasSearched(true)

    const params = new URLSearchParams()
    if (areaCode) params.set('areaCode', areaCode)
    if (city) params.set('locality', city)
    if (state) params.set('region', state)
    if (pattern) params.set('contains', pattern)

    try {
      const res = await fetch(`/api/phone-numbers/search?${params.toString()}`)
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Search failed')
      }
      const data = (await res.json()) as { numbers: AvailableNumber[] }
      setResults(data.numbers)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Search failed')
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }

  async function handleBrowse() {
    setAreaCode('')
    setCity('')
    setState('')
    setPattern('')
    setIsSearching(true)
    setHasSearched(true)

    try {
      const res = await fetch('/api/phone-numbers/search?limit=20')
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Search failed')
      }
      const data = (await res.json()) as { numbers: AvailableNumber[] }
      setResults(data.numbers)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Search failed')
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }

  async function handleSelectTwilio(phoneNumber: string) {
    setSecuringNumber(phoneNumber)
    try {
      const res = await fetch(`/api/agents/${agentId}/provision-number`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to secure number')
      }
      toast.success('Phone number secured!')
      router.push(`/dashboard/voice-agents/${agentId}`)
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      if (message.toLowerCase().includes('purchase failed')) {
        toast.error('This number was just claimed. Please pick another.')
      } else {
        toast.error(message)
      }
      setSecuringNumber(null)
    }
  }

  async function handleSelectPool(poolNumberId: string) {
    setSecuringNumber(poolNumberId)
    try {
      const res = await fetch(`/api/agents/${agentId}/provision-number`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poolNumberId }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to assign number')
      }
      toast.success('Number assigned from pool!')
      router.push(`/dashboard/voice-agents/${agentId}`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
      setSecuringNumber(null)
    }
  }

  if (!canProvision) {
    return (
      <div className="p-6 sm:p-8 max-w-5xl mx-auto">
        <Link
          href={`/dashboard/voice-agents/${agentId}`}
          className="text-xs text-muted hover:text-ink transition-colors mb-4 inline-flex items-center gap-1"
        >
          <span aria-hidden="true">&larr;</span> Back to agent
        </Link>
        <h1 className="font-serif text-2xl sm:text-3xl text-ink mb-2">Choose a phone number</h1>
        <div className="bg-white rounded-xl border border-border p-10 text-center mt-6">
          <p className="text-sm text-muted">Phone provisioning is not available. Please contact support.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      {/* Back link */}
      <Link
        href={`/dashboard/voice-agents/${agentId}`}
        className="text-xs text-muted hover:text-ink transition-colors mb-4 inline-flex items-center gap-1"
      >
        <span aria-hidden="true">&larr;</span> Back to agent
      </Link>

      {/* Heading */}
      <h1 className="font-serif text-2xl sm:text-3xl text-ink mb-1">Choose a phone number</h1>
      <p className="text-sm text-muted mb-8">
        Pick a number for {agentName}. Search by area code, city, or find a memorable number.
      </p>

      {/* Pool numbers section */}
      {poolNumbers.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-medium text-ink mb-3">
            Numbers from your pool <span className="text-muted font-normal">(no extra charge)</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {poolNumbers.map((pn) => (
              <div
                key={pn.id}
                className="bg-white rounded-xl border border-border p-4 flex items-center justify-between"
              >
                <div>
                  <p className="text-lg font-medium text-ink">{formatPhone(pn.number)}</p>
                  {pn.areaCode && (
                    <p className="text-xs text-muted">Area code {pn.areaCode}</p>
                  )}
                </div>
                <button
                  onClick={() => void handleSelectPool(pn.id)}
                  disabled={securingNumber !== null}
                  className="bg-accent text-white px-3 py-1.5 rounded-lg text-sm hover:bg-accent/90 font-medium transition-colors disabled:opacity-50"
                >
                  {securingNumber === pn.id ? 'Securing...' : 'Select'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Search section */}
      <section>
        <h2 className="text-sm font-medium text-ink mb-3">Search for a number</h2>

        <form onSubmit={(e) => void handleSearch(e)} className="flex flex-wrap gap-3 mb-6">
          <input
            type="text"
            value={areaCode}
            onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
            placeholder="Area code"
            className="w-28 px-3 py-2 rounded-lg border border-border bg-white text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City"
            className="w-40 px-3 py-2 rounded-lg border border-border bg-white text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="w-36 px-3 py-2 rounded-lg border border-border bg-white text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          >
            <option value="">Any state</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <input
            type="text"
            value={pattern}
            onChange={(e) => setPattern(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20))}
            placeholder="e.g. DENT"
            title="Letters or digits in the number"
            className="w-32 px-3 py-2 rounded-lg border border-border bg-white text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
          <button
            type="submit"
            disabled={isSearching}
            className="bg-accent text-white px-4 py-2 rounded-lg text-sm hover:bg-accent/90 font-medium transition-colors disabled:opacity-50"
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </form>

        {/* Results */}
        {isSearching && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-pulse">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-border p-5 h-20" />
            ))}
          </div>
        )}

        {!isSearching && hasSearched && results.length === 0 && (
          <div className="bg-white rounded-xl border border-border p-10 text-center">
            <p className="text-sm text-muted">No numbers found. Try a different search.</p>
          </div>
        )}

        {!isSearching && results.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {results.map((num) => {
              const location = formatLocation(num.locality, num.region)
              return (
                <div
                  key={num.phoneNumber}
                  className="bg-white rounded-xl border border-border p-4 flex items-center justify-between"
                >
                  <div>
                    <p className="text-lg font-medium text-ink">{formatPhone(num.phoneNumber)}</p>
                    {location && (
                      <p className="text-xs text-muted">{location}</p>
                    )}
                  </div>
                  <button
                    onClick={() => void handleSelectTwilio(num.phoneNumber)}
                    disabled={securingNumber !== null}
                    className="bg-accent text-white px-3 py-1.5 rounded-lg text-sm hover:bg-accent/90 font-medium transition-colors disabled:opacity-50"
                  >
                    {securingNumber === num.phoneNumber ? 'Securing...' : 'Select'}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {!isSearching && !hasSearched && (
          <div className="bg-white rounded-xl border border-border p-10 text-center">
            <p className="text-sm text-muted mb-3">Search for a number, or browse what&apos;s available.</p>
            <button
              onClick={() => void handleBrowse()}
              className="bg-white text-ink px-4 py-2 rounded-lg text-sm border border-border hover:bg-cream font-medium transition-colors"
            >
              Browse numbers
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
