'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface WhatsAppStatusCardProps {
  agentId: string
  whatsappStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'FAILED'
  whatsappEnabled: boolean
  hasPhoneNumber: boolean
  isActive: boolean
}

export function WhatsAppStatusCard({
  agentId,
  whatsappStatus,
  whatsappEnabled,
  hasPhoneNumber,
  isActive,
}: WhatsAppStatusCardProps) {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(whatsappStatus)
  const [enabled, setEnabled] = useState(whatsappEnabled)

  async function handleEnable() {
    setLoading(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/whatsapp`, { method: 'POST' })
      if (res.ok) setStatus('PENDING')
    } finally {
      setLoading(false)
    }
  }

  async function handleDisable() {
    setLoading(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/whatsapp`, { method: 'DELETE' })
      if (res.ok) { setStatus('NONE'); setEnabled(false) }
    } finally {
      setLoading(false)
    }
  }

  const canEnable = hasPhoneNumber && isActive && (status === 'NONE' || status === 'FAILED')

  return (
    <div className="bg-white rounded-xl border border-border p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* WhatsApp icon */}
          <div className="w-9 h-9 rounded-lg bg-[#25D366]/10 flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-medium text-ink">WhatsApp</h3>
            <StatusLabel status={status} />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {status === 'APPROVED' && enabled && (
            <button
              onClick={() => void handleDisable()}
              disabled={loading}
              className="text-xs text-muted hover:text-ink transition-colors disabled:opacity-50"
            >
              Disable
            </button>
          )}
          {canEnable && (
            <button
              onClick={() => void handleEnable()}
              disabled={loading}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                'bg-accent text-white border-accent hover:bg-accent/90',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {loading ? 'Setting up...' : status === 'FAILED' ? 'Try again' : 'Enable'}
            </button>
          )}
        </div>
      </div>

      <StatusDescription status={status} hasPhoneNumber={hasPhoneNumber} isActive={isActive} />
    </div>
  )
}

function StatusLabel({ status }: { status: string }) {
  if (status === 'APPROVED') {
    return <p className="text-xs text-success mt-0.5">● Active</p>
  }
  if (status === 'PENDING') {
    return <p className="text-xs text-muted mt-0.5">○ Setting up...</p>
  }
  if (status === 'FAILED') {
    return <p className="text-xs text-red-500 mt-0.5">● Setup failed</p>
  }
  return <p className="text-xs text-muted mt-0.5">○ Not set up</p>
}

function StatusDescription({
  status,
  hasPhoneNumber,
  isActive,
}: {
  status: string
  hasPhoneNumber: boolean
  isActive: boolean
}) {
  if (!hasPhoneNumber || !isActive) {
    return (
      <p className="text-xs text-muted mt-3">
        Deploy your agent and provision a phone number to enable WhatsApp.
      </p>
    )
  }
  if (status === 'APPROVED') {
    return (
      <p className="text-xs text-muted mt-3">
        Customers can call or message you on WhatsApp at your number.
      </p>
    )
  }
  if (status === 'PENDING') {
    return (
      <p className="text-xs text-muted mt-3">
        Setting up WhatsApp... This usually takes a few hours. We&apos;ll update this page when it&apos;s ready.
      </p>
    )
  }
  if (status === 'FAILED') {
    return (
      <p className="text-xs text-muted mt-3">
        WhatsApp setup didn&apos;t go through. Try again or contact support.
      </p>
    )
  }
  return (
    <p className="text-xs text-muted mt-3">
      Let customers call or message you on WhatsApp — no separate number needed.
    </p>
  )
}
