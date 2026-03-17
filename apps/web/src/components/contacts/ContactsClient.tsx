'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ContactCard } from './ContactCard'
import type { ContactCardData } from './ContactCard'

interface ContactsClientProps {
  initialContacts: ContactCardData[]
  initialTotal: number
  initialNextCursor: string | null
}

interface ContactsApiResponse {
  contacts: ContactCardData[]
  nextCursor: string | null
  total: number
}

function SearchIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-muted"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

export function ContactsClient({
  initialContacts,
  initialTotal,
  initialNextCursor,
}: ContactsClientProps) {
  const [search, setSearch] = useState('')
  const [contacts, setContacts] = useState<ContactCardData[]>(initialContacts)
  const [total, setTotal] = useState(initialTotal)
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  // Ref used to cancel stale fetch requests when search changes quickly.
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Track the latest search term to discard out-of-order responses.
  const latestSearch = useRef(search)
  // Skip the first effect run — initial data is already server-rendered.
  const isMounted = useRef(false)

  const fetchContacts = useCallback(async (query: string, cursor?: string) => {
    const params = new URLSearchParams({ limit: '20' })
    if (query) params.set('search', query)
    if (cursor) params.set('cursor', cursor)

    const res = await fetch(`/api/contacts?${params.toString()}`)
    if (!res.ok) throw new Error('Failed to fetch contacts')
    return (await res.json()) as ContactsApiResponse
  }, [])

  // When the search term changes, debounce and re-fetch from the top.
  useEffect(() => {
    // Skip the initial mount — SSR data is already hydrated.
    if (!isMounted.current) {
      isMounted.current = true
      return
    }

    latestSearch.current = search

    if (debounceTimer.current) clearTimeout(debounceTimer.current)

    // Immediately reset to loading state so stale results don't flash.
    setLoading(true)

    debounceTimer.current = setTimeout(() => {
      void (async () => {
        try {
          const data = await fetchContacts(search)
          // Discard if a newer search has been issued.
          if (latestSearch.current !== search) return
          setContacts(data.contacts)
          setTotal(data.total)
          setNextCursor(data.nextCursor)
        } catch {
          // Silently fail — the initial data is still rendered.
        } finally {
          if (latestSearch.current === search) setLoading(false)
        }
      })()
    }, 300)

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  async function loadMore() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const data = await fetchContacts(search, nextCursor)
      setContacts((prev) => [...prev, ...data.contacts])
      setNextCursor(data.nextCursor)
    } catch {
      // Non-fatal — the user can try again.
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div>
      {/* Search bar */}
      <div className="relative mb-6">
        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
          <SearchIcon />
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or phone number…"
          className="w-full pl-9 pr-4 py-2.5 text-sm text-ink bg-white border border-border rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent outline-none"
          aria-label="Search contacts"
        />
      </div>

      {/* Results */}
      {loading ? (
        <div className="space-y-3">
          {[...Array<null>(3)].map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-border p-5 animate-pulse"
            >
              <div className="h-4 w-40 bg-border rounded mb-2" />
              <div className="h-3 w-28 bg-border rounded mb-3" />
              <div className="h-3 w-48 bg-border rounded" />
            </div>
          ))}
        </div>
      ) : contacts.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          <p className="text-sm text-muted">
            {search.length > 0
              ? 'No contacts match your search.'
              : 'No contacts yet. When people call your voice agents, their info will be saved here automatically.'}
          </p>
        </div>
      ) : (
        <>
          {search.length > 0 && (
            <p className="text-xs text-muted mb-3">
              {total === 1 ? '1 result' : `${total} results`}
            </p>
          )}
          <div className="flex flex-col gap-3">
            {contacts.map((contact) => (
              <ContactCard key={contact.id} contact={contact} />
            ))}
          </div>

          {nextCursor && (
            <div className="mt-6 text-center">
              <button
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="px-5 py-2 text-sm font-medium text-muted hover:text-ink border border-border rounded-lg hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
