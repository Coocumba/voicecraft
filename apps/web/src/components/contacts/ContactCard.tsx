'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { LocalTime } from '@/components/ui/LocalTime'

export interface ContactCardData {
  id: string
  phone: string
  name: string | null
  email: string | null
  notes: string | null
  callCount: number
  lastCalledAt: string | null // ISO string from JSON
  appointmentCount: number
}

interface ContactCardProps {
  contact: ContactCardData
}

function PencilIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function LastCalled({ date }: { date: string | null }) {
  if (!date) return <span>Never called</span>
  return <span>Last called <LocalTime date={date} format="date" /></span>
}

export function ContactCard({ contact: initialContact }: ContactCardProps) {
  const [contact, setContact] = useState(initialContact)
  const [editing, setEditing] = useState(false)
  const [nameInput, setNameInput] = useState(contact.name ?? '')
  const [notesInput, setNotesInput] = useState(contact.notes ?? '')
  const [saving, setSaving] = useState(false)

  function startEdit() {
    setNameInput(contact.name ?? '')
    setNotesInput(contact.notes ?? '')
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
  }

  async function handleSave() {
    if (saving) return

    const trimmedName = nameInput.trim()
    const trimmedNotes = notesInput.trim()

    if (trimmedName.length > 200) {
      toast.error('Name must be 200 characters or fewer.')
      return
    }
    if (trimmedNotes.length > 2000) {
      toast.error('Notes must be 2000 characters or fewer.')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName.length > 0 ? trimmedName : null,
          notes: trimmedNotes.length > 0 ? trimmedNotes : null,
        }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to save')
      }

      const data = (await res.json()) as {
        contact: { name: string | null; notes: string | null }
      }
      setContact((prev) => ({
        ...prev,
        name: data.contact.name,
        notes: data.contact.notes,
      }))
      setEditing(false)
      toast.success('Contact updated')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save contact'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const callStat =
    contact.callCount === 0
      ? 'No calls yet'
      : contact.callCount === 1
        ? '1 call'
        : `${contact.callCount} calls`

  return (
    <article className="bg-white rounded-xl border border-border p-5 transition-shadow hover:shadow-sm">
      {/* Header row: name + edit button */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Full name"
              maxLength={200}
              className="w-full px-3 py-1.5 text-sm text-ink bg-cream border border-border rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent outline-none"
              aria-label="Contact name"
              autoFocus
            />
          ) : (
            <p
              className={cn(
                'text-base font-medium',
                contact.name ? 'text-ink' : 'text-muted italic'
              )}
            >
              {contact.name ?? 'Unknown'}
            </p>
          )}
        </div>

        {!editing && (
          <button
            onClick={startEdit}
            className="shrink-0 flex items-center gap-1.5 text-xs text-muted hover:text-accent transition-colors px-2 py-1 rounded-lg hover:bg-accent/5"
            aria-label={`Edit contact ${contact.name ?? contact.phone}`}
          >
            <PencilIcon />
            Edit
          </button>
        )}
      </div>

      {/* Phone number */}
      <p className="text-sm text-muted mt-1">{contact.phone}</p>

      {/* Call stats */}
      <p className="text-xs text-muted mt-2">
        {callStat}
        {contact.callCount > 0 && contact.lastCalledAt && (
          <> · <LastCalled date={contact.lastCalledAt} /></>
        )}
        {contact.appointmentCount > 0 && (
          <> · {contact.appointmentCount}{' '}
          {contact.appointmentCount === 1 ? 'appointment' : 'appointments'}</>
        )}
      </p>

      {/* Notes field */}
      {editing ? (
        <div className="mt-3">
          <label className="text-xs text-muted block mb-1" htmlFor={`notes-${contact.id}`}>
            Notes
          </label>
          <textarea
            id={`notes-${contact.id}`}
            value={notesInput}
            onChange={(e) => setNotesInput(e.target.value)}
            placeholder="Add a note about this contact…"
            maxLength={2000}
            rows={3}
            className="w-full px-3 py-2 text-sm text-ink bg-cream border border-border rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent outline-none resize-none"
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={cancelEdit}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium text-muted hover:text-ink transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        contact.notes && (
          <p className="text-sm text-muted mt-3 leading-relaxed">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Notes: </span>
            {contact.notes}
          </p>
        )
      )}
    </article>
  )
}
