'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarConnectButtons } from '@/components/integrations/CalendarConnectButtons'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CalendarStatus {
  available: boolean
  connected: boolean
  email?: string
}

type DisconnectStep = 'idle' | 'confirming' | 'disconnecting'

// ---------------------------------------------------------------------------
// CalendarSection
// ---------------------------------------------------------------------------

function CalendarSection() {
  const [googleStatus, setGoogleStatus] = useState<CalendarStatus | null>(null)
  const [microsoftStatus, setMicrosoftStatus] = useState<CalendarStatus | null>(null)
  const [disconnectStep, setDisconnectStep] = useState<DisconnectStep>('idle')

  const fetchStatus = useCallback(async () => {
    const [gRes, mRes] = await Promise.all([
      fetch('/api/integrations/google/status').then(r => r.ok ? r.json() : { available: false, connected: false }).catch(() => ({ available: false, connected: false })),
      fetch('/api/integrations/microsoft/status').then(r => r.ok ? r.json() : { available: false, connected: false }).catch(() => ({ available: false, connected: false })),
    ])
    setGoogleStatus(gRes as CalendarStatus)
    setMicrosoftStatus(mRes as CalendarStatus)
  }, [])

  useEffect(() => {
    void fetchStatus()
  }, [fetchStatus])

  // Determine which provider is connected (at most one)
  const connectedProvider = googleStatus?.connected ? 'google' : microsoftStatus?.connected ? 'microsoft' : null
  const connectedEmail = connectedProvider === 'google' ? googleStatus?.email : connectedProvider === 'microsoft' ? microsoftStatus?.email : undefined
  const connectedLabel = connectedProvider === 'google' ? 'Google Calendar' : connectedProvider === 'microsoft' ? 'Microsoft Outlook' : null

  async function handleDisconnect() {
    if (!connectedProvider) return
    setDisconnectStep('disconnecting')
    const endpoint = connectedProvider === 'google'
      ? '/api/integrations/google/disconnect'
      : '/api/integrations/microsoft/disconnect'
    try {
      const res = await fetch(endpoint, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to disconnect')
      // Refresh status
      await fetchStatus()
      setDisconnectStep('idle')
      toast.success(`${connectedLabel} disconnected`)
    } catch {
      setDisconnectStep('idle')
      toast.error('Could not disconnect. Please try again.')
    }
  }

  // Loading skeleton
  if (googleStatus === null || microsoftStatus === null) {
    return (
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-4 w-48 rounded bg-border animate-pulse" />
          <div className="h-3 w-64 rounded bg-border animate-pulse" />
        </div>
        <div className="h-8 w-32 rounded-lg bg-border animate-pulse" />
      </div>
    )
  }

  // Connected state — show which provider is connected
  if (connectedProvider && connectedLabel) {
    return (
      <div className="flex flex-col sm:flex-row items-start sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-success shrink-0" aria-hidden="true" />
            <span className="text-sm font-medium text-success">{connectedLabel} — Connected</span>
          </div>
          {connectedEmail && (
            <p className="text-xs text-muted">{connectedEmail}</p>
          )}
          <p className="text-xs text-muted">
            Appointments booked by your voice agent will appear in this calendar.
          </p>
        </div>

        <div className="shrink-0">
          {disconnectStep === 'idle' && (
            <button
              onClick={() => setDisconnectStep('confirming')}
              className="text-sm text-muted hover:text-ink underline underline-offset-2 transition-colors"
            >
              Disconnect
            </button>
          )}
          {disconnectStep === 'confirming' && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-ink">Disconnect?</span>
              <button
                onClick={() => void handleDisconnect()}
                className="font-medium text-red-600 hover:text-red-700 transition-colors"
              >
                Yes
              </button>
              <button
                onClick={() => setDisconnectStep('idle')}
                className="text-muted hover:text-ink transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
          {disconnectStep === 'disconnecting' && (
            <span className="text-sm text-muted">Disconnecting…</span>
          )}
        </div>
      </div>
    )
  }

  // Neither connected — show connect options
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <p className="text-sm text-ink">Connect your calendar</p>
        <p className="text-xs text-muted">
          Automatically add booked appointments to your calendar.
        </p>
      </div>
      <div className="shrink-0">
        <CalendarConnectButtons returnTo="/dashboard/settings" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SettingsPage
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const { data: session, update } = useSession()
  const [name, setName] = useState(session?.user?.name ?? '')
  const [saving, setSaving] = useState(false)

  const searchParams = useSearchParams()
  const router = useRouter()

  // Show a toast and clean the URL when OAuth redirects back.
  useEffect(() => {
    const integration = searchParams.get('integration')
    const provider = searchParams.get('provider')

    if (provider !== 'google' && provider !== 'microsoft') return

    const providerLabel = provider === 'google' ? 'Google Calendar' : 'Microsoft Outlook'

    if (integration === 'success') {
      toast.success(`${providerLabel} connected successfully`)
    } else if (integration === 'error') {
      toast.error(`Could not connect ${providerLabel}. Please try again.`)
    } else {
      return
    }

    // Remove query params from the URL without a navigation.
    const url = new URL(window.location.href)
    url.searchParams.delete('integration')
    url.searchParams.delete('provider')
    router.replace(url.pathname + (url.search || ''), { scroll: false })
  }, [searchParams, router])

  // Sync name field when session loads.
  useEffect(() => {
    if (session?.user?.name) {
      setName(session.user.name)
    }
  }, [session?.user?.name])

  const trimmedName = name.trim()
  const nameError =
    trimmedName.length === 0
      ? 'Name is required'
      : trimmedName.length < 2
        ? 'Name must be at least 2 characters'
        : trimmedName.length > 100
          ? 'Name must be under 100 characters'
          : null

  async function handleSaveName() {
    if (nameError || saving || trimmedName === session?.user?.name) return
    setSaving(true)
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName }),
      })
      if (!res.ok) throw new Error('Failed to update name')
      await update({ name: trimmedName })
      toast.success('Name updated')
    } catch {
      toast.error('Failed to update name')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      <h1 className="font-serif text-2xl sm:text-3xl text-ink mb-8">Settings</h1>

      <div className="space-y-5">
        {/* Account */}
        <div className="bg-white rounded-xl border border-border p-6">
          <div className="mb-5">
            <h2 className="font-serif text-base text-ink">Account</h2>
            <p className="text-sm text-muted mt-1">Your account details.</p>
          </div>
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="text-sm text-muted block mb-1">
                Name
              </label>
              <div className="flex gap-2">
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm text-ink bg-cream border border-border rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent outline-none"
                />
                <button
                  onClick={() => void handleSaveName()}
                  disabled={saving || !!nameError || trimmedName === session?.user?.name}
                  className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
              {nameError && name.length > 0 && (
                <p className="text-xs text-red-500 mt-1">{nameError}</p>
              )}
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Email</span>
              <span className="text-ink">{session?.user?.email ?? '—'}</span>
            </div>
          </div>
        </div>

        {/* Calendar */}
        <div className="bg-white rounded-xl border border-border p-6">
          <div className="mb-5">
            <h2 className="font-serif text-base text-ink">Calendar</h2>
            <p className="text-sm text-muted mt-1">
              Sync booked appointments directly to your calendar.
            </p>
          </div>
          <CalendarSection />
        </div>
      </div>
    </div>
  )
}
