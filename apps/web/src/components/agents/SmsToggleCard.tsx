'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'

interface SmsToggleCardProps {
  agentId: string
  smsEnabled: boolean
  hasPhoneNumber: boolean
  canBookAppointments: boolean
}

export function SmsToggleCard({
  agentId,
  smsEnabled,
  hasPhoneNumber,
  canBookAppointments,
}: SmsToggleCardProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [confirmOff, setConfirmOff] = useState(false)

  if (!hasPhoneNumber || !canBookAppointments) return null

  async function handleEnable() {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/sms`, { method: 'POST' })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to enable SMS')
      }
      toast.success('Text messages enabled!')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleDisable() {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/sms`, { method: 'DELETE' })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to disable SMS')
      }
      toast.success('Text messages disabled')
      setConfirmOff(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  if (smsEnabled) {
    return (
      <div id="sms-toggle-section" className="bg-success/5 border border-success/20 rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-success" />
            <p className="text-sm font-medium text-ink">Text messages are on</p>
          </div>
          {confirmOff ? (
            <span className="flex items-center gap-2">
              <button
                onClick={() => void handleDisable()}
                disabled={isLoading}
                className="text-xs text-red-600 hover:text-red-700 font-medium transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Turning off...' : 'Confirm turn off'}
              </button>
              <button
                onClick={() => setConfirmOff(false)}
                className="text-xs text-muted hover:text-ink font-medium transition-colors"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmOff(true)}
              className="text-xs text-muted hover:text-ink font-medium transition-colors"
            >
              Turn off
            </button>
          )}
        </div>
        <p className="text-xs text-muted mt-2 ml-4">
          Customers can text this number. Replies the bot can&apos;t handle appear in{' '}
          <Link href="/dashboard/messages" className="text-accent hover:text-accent/80 font-medium transition-colors">
            Messages
          </Link>
          .
        </p>
      </div>
    )
  }

  return (
    <div id="sms-toggle-section" className="bg-white rounded-xl border border-border p-5">
      <p className="text-sm font-medium text-ink mb-2">Handle text messages too?</p>
      <p className="text-xs text-muted mb-3">
        Customers can text this number and get instant replies about your hours, services,
        and appointments. You&apos;ll see conversations in your dashboard.
      </p>
      <p className="text-xs text-muted mb-4">Each text costs about 1 cent.</p>
      <button
        onClick={() => void handleEnable()}
        disabled={isLoading}
        className="bg-accent text-white px-4 py-2 rounded-lg text-sm hover:bg-accent/90 font-medium transition-colors disabled:opacity-50"
      >
        {isLoading ? 'Enabling...' : 'Enable text messages'}
      </button>
    </div>
  )
}
