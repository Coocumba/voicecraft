'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'

export default function SettingsPage() {
  const { data: session, update } = useSession()
  const [name, setName] = useState(session?.user?.name ?? '')
  const [saving, setSaving] = useState(false)

  const trimmedName = name.trim()
  const nameError = trimmedName.length === 0
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
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!res.ok) throw new Error('Failed to update name')
      await update({ name: name.trim() })
      toast.success('Name updated')
    } catch {
      toast.error('Failed to update name')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 sm:p-8 max-w-3xl mx-auto">
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
              <label htmlFor="name" className="text-sm text-muted block mb-1">Name</label>
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

        {/* Google Calendar */}
        <div className="bg-white rounded-xl border border-border p-6">
          <div className="mb-5">
            <h2 className="font-serif text-base text-ink">Google Calendar</h2>
            <p className="text-sm text-muted mt-1">Sync booked appointments directly to your calendar.</p>
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm text-ink">Connect your Google Calendar</p>
              <p className="text-xs text-muted">
                Automatically create calendar events when appointments are booked by your voice agent.
              </p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-muted/15 text-muted">
              Coming soon
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
