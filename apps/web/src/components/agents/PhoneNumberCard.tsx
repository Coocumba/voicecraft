'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { formatPhone } from '@/lib/format-utils'

interface PoolNumber {
  id: string
  number: string
  areaCode: string | null
}

interface OtherAgent {
  id: string
  name: string
}

interface PhoneNumberCardProps {
  agentId: string
  phoneNumber: string | null
  phoneNumberSource: string | null
  isActive: boolean
  canProvision: boolean
  poolNumbers?: PoolNumber[]
  otherAgentsWithoutNumber?: OtherAgent[]
}

export function PhoneNumberCard({
  agentId,
  phoneNumber,
  phoneNumberSource,
  isActive,
  canProvision,
  poolNumbers = [],
  otherAgentsWithoutNumber = [],
}: PhoneNumberCardProps) {
  const router = useRouter()
  const [isProvisioning, setIsProvisioning] = useState(false)
  const [isReleasing, setIsReleasing] = useState(false)
  const [confirmRelease, setConfirmRelease] = useState(false)
  const [showPoolPicker, setShowPoolPicker] = useState(false)
  const [showReassign, setShowReassign] = useState(false)
  const [isReassigning, setIsReassigning] = useState(false)

  async function handleProvision(poolNumberId?: string) {
    setIsProvisioning(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/provision-number`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poolNumberId }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to provision number')
      }
      const result = (await res.json()) as { fromPool?: boolean }
      toast.success(result.fromPool ? 'Number assigned from pool!' : 'Phone number provisioned!')
      setShowPoolPicker(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsProvisioning(false)
    }
  }

  async function handleRelease() {
    setIsReleasing(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/provision-number`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to release number')
      }
      toast.success('Phone number released to pool')
      setConfirmRelease(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsReleasing(false)
    }
  }

  async function handleReassign(toAgentId: string) {
    if (!phoneNumber) return
    setIsReassigning(true)
    try {
      const res = await fetch('/api/phone-numbers/reassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, toAgentId }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to reassign number')
      }
      toast.success('Number moved to other agent!')
      setShowReassign(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsReassigning(false)
    }
  }

  // --- State: Provisioning in progress ---
  if (isProvisioning) {
    return (
      <div id="phone-number-section" className="bg-white rounded-xl border border-border p-5">
        <p className="text-xs text-muted font-medium mb-3">Phone Number</p>
        <div className="flex items-center gap-2 text-sm text-muted">
          <span className="inline-block h-4 w-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          Getting your number...
        </div>
      </div>
    )
  }

  // --- State: Number assigned ---
  if (phoneNumber) {
    return (
      <div id="phone-number-section" className="bg-white rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-muted font-medium">Phone Number</p>
          {phoneNumberSource === 'provisioned' && (
            <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full font-medium">
              Provisioned
            </span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <p className="text-ink text-sm font-medium">{formatPhone(phoneNumber)}</p>
          {isActive ? (
            <p className="text-xs text-muted">Deactivate agent to change number</p>
          ) : (
            <div className="flex items-center gap-3">
              {phoneNumberSource === 'provisioned' && otherAgentsWithoutNumber.length > 0 && (
                <button
                  onClick={() => setShowReassign(!showReassign)}
                  className="text-xs text-accent hover:text-accent/80 font-medium transition-colors"
                >
                  Move
                </button>
              )}
              {confirmRelease ? (
                <span className="flex items-center gap-2">
                  <button
                    onClick={() => void handleRelease()}
                    disabled={isReleasing}
                    className="text-xs text-red-600 hover:text-red-700 font-medium transition-colors disabled:opacity-50"
                  >
                    {isReleasing ? 'Releasing...' : 'Confirm release'}
                  </button>
                  <button
                    onClick={() => setConfirmRelease(false)}
                    className="text-xs text-muted hover:text-ink font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmRelease(true)}
                  className="text-xs text-red-600 hover:text-red-700 font-medium transition-colors"
                >
                  Release
                </button>
              )}
            </div>
          )}
        </div>

        {/* Reassign picker */}
        {showReassign && !isActive && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs text-muted mb-2">Move this number to:</p>
            <div className="flex flex-wrap gap-2">
              {otherAgentsWithoutNumber.map((a) => (
                <button
                  key={a.id}
                  onClick={() => void handleReassign(a.id)}
                  disabled={isReassigning}
                  className="text-xs bg-cream hover:bg-border/50 text-ink px-3 py-1.5 rounded-lg border border-border font-medium transition-colors disabled:opacity-50"
                >
                  {a.name}
                </button>
              ))}
              <button
                onClick={() => setShowReassign(false)}
                className="text-xs text-muted hover:text-ink font-medium px-2"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // --- State: No number ---
  return (
    <div id="phone-number-section" className="bg-white rounded-xl border border-border p-5">
      <p className="text-xs text-muted font-medium mb-3">Phone Number</p>

      {/* Pool number picker */}
      {showPoolPicker && poolNumbers.length > 0 ? (
        <div>
          <p className="text-xs text-muted mb-2">Available numbers from your pool:</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {poolNumbers.map((pn) => (
              <button
                key={pn.id}
                onClick={() => void handleProvision(pn.id)}
                className="text-xs bg-cream hover:bg-border/50 text-ink px-3 py-1.5 rounded-lg border border-border font-medium transition-colors"
              >
                {formatPhone(pn.number)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => void handleProvision()}
              className="text-xs text-accent hover:text-accent/80 font-medium transition-colors"
            >
              Get a new number instead
            </button>
            <button
              onClick={() => setShowPoolPicker(false)}
              className="text-xs text-muted hover:text-ink font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : !canProvision ? (
        <p className="text-sm text-muted">
          Phone provisioning is not available. Please contact support.
        </p>
      ) : (
        <div className="space-y-2">
          <button
            onClick={() => {
              if (poolNumbers.length > 0) {
                setShowPoolPicker(true)
              } else {
                void handleProvision()
              }
            }}
            className="bg-accent text-white px-4 py-2 rounded-lg text-sm hover:bg-accent/90 font-medium transition-colors"
          >
            Get a phone number
          </button>
          <div className="text-xs text-muted">
            or{' '}
            <Link
              href={`/dashboard/voice-agents/${agentId}/choose-number`}
              className="text-accent hover:text-accent/80 font-medium transition-colors"
            >
              Browse &amp; choose a number →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
