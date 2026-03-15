'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface EditPhoneNumberProps {
  agentId: string
  currentNumber: string | null
}

// Strips formatting, validates E.164-like pattern: + followed by 7-15 digits
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-().]/g, '')
  if (/^\+?\d{7,15}$/.test(digits)) {
    return digits.startsWith('+') ? digits : `+${digits}`
  }
  return null
}

export function EditPhoneNumber({ agentId, currentNumber }: EditPhoneNumberProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [phone, setPhone] = useState(currentNumber ?? '')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  async function handleSave() {
    const normalized = normalizePhone(phone)
    if (!normalized) {
      setError('Enter a valid phone number, e.g. +15551234567')
      return
    }
    setError('')
    setIsSaving(true)
    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: normalized }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to update')
      }
      toast.success('Phone number updated')
      setIsEditing(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isEditing) {
    return (
      <div className="flex items-center gap-2">
        <span className={currentNumber ? 'text-ink text-sm font-medium' : 'text-muted text-sm'}>
          {currentNumber || 'Not assigned'}
        </span>
        <button
          onClick={() => setIsEditing(true)}
          className="text-xs text-accent hover:text-accent/80 font-medium transition-colors"
        >
          {currentNumber ? 'Edit' : 'Add'}
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="tel"
          value={phone}
          onChange={(e) => { setPhone(e.target.value); setError('') }}
          placeholder="+15551234567"
          className={`px-2 py-1 border rounded-lg bg-white text-ink text-sm focus:ring-2 focus:ring-accent focus:border-transparent outline-none w-40 ${error ? 'border-red-400' : 'border-border'}`}
          autoFocus
        />
        <button
          onClick={() => void handleSave()}
          disabled={isSaving}
          className="text-xs text-accent hover:text-accent/80 font-medium disabled:opacity-50"
        >
          {isSaving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={() => { setIsEditing(false); setPhone(currentNumber ?? ''); setError('') }}
          className="text-xs text-muted hover:text-ink font-medium"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}
