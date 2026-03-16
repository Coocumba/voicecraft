'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface PhoneNumberCardProps {
  agentId: string
  phoneNumber: string | null
  phoneNumberSource: string | null
  isActive: boolean
  canProvision: boolean
}

/** Strips formatting, validates E.164-like pattern: + followed by 7-15 digits */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-().]/g, '')
  if (/^\+?\d{7,15}$/.test(digits)) {
    return digits.startsWith('+') ? digits : `+${digits}`
  }
  return null
}

/** Format E.164 number to readable US format if applicable */
function formatPhone(number: string): string {
  const match = number.match(/^\+1(\d{3})(\d{3})(\d{4})$/)
  if (match) return `+1 (${match[1]}) ${match[2]}-${match[3]}`
  return number
}

export function PhoneNumberCard({ agentId, phoneNumber, phoneNumberSource, isActive, canProvision }: PhoneNumberCardProps) {
  const router = useRouter()
  const [isProvisioning, setIsProvisioning] = useState(false)
  const [isReleasing, setIsReleasing] = useState(false)
  const [confirmRelease, setConfirmRelease] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [manualPhone, setManualPhone] = useState('')
  const [manualError, setManualError] = useState('')
  const [isSavingManual, setIsSavingManual] = useState(false)

  async function handleProvision() {
    setIsProvisioning(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/provision-number`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to provision number')
      }
      toast.success('Phone number provisioned!')
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
      toast.success('Phone number released')
      setConfirmRelease(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsReleasing(false)
    }
  }

  async function handleManualSave() {
    const normalized = normalizePhone(manualPhone)
    if (!normalized) {
      setManualError('Enter a valid phone number, e.g. +15551234567')
      return
    }
    setManualError('')
    setIsSavingManual(true)
    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: normalized, phoneNumberSource: 'manual' }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to update')
      }
      toast.success('Phone number saved')
      setShowManual(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsSavingManual(false)
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
          {phoneNumberSource === 'manual' && (
            <span className="text-xs bg-muted/15 text-muted px-2 py-0.5 rounded-full font-medium">
              Your number
            </span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <p className="text-ink text-sm font-medium">{formatPhone(phoneNumber)}</p>
          {isActive ? (
            <p className="text-xs text-muted">Deactivate agent to change number</p>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  // Clear number to go back to "no number" state
                  setShowManual(true)
                  setManualPhone(phoneNumber)
                }}
                className="text-xs text-accent hover:text-accent/80 font-medium transition-colors"
              >
                Change
              </button>
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

        {/* Inline manual edit when "Change" is clicked */}
        {showManual && !isActive && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="flex items-center gap-2">
              <input
                type="tel"
                value={manualPhone}
                onChange={(e) => { setManualPhone(e.target.value); setManualError('') }}
                placeholder="+15551234567"
                className={`px-2 py-1 border rounded-lg bg-white text-ink text-sm focus:ring-2 focus:ring-accent focus:border-transparent outline-none w-40 ${manualError ? 'border-red-400' : 'border-border'}`}
                autoFocus
              />
              <button
                onClick={() => void handleManualSave()}
                disabled={isSavingManual}
                className="text-xs text-accent hover:text-accent/80 font-medium disabled:opacity-50"
              >
                {isSavingManual ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => { setShowManual(false); setManualPhone(''); setManualError('') }}
                className="text-xs text-muted hover:text-ink font-medium"
              >
                Cancel
              </button>
            </div>
            {manualError && <p className="text-xs text-red-500 mt-1">{manualError}</p>}
          </div>
        )}
      </div>
    )
  }

  // --- State: No number ---
  return (
    <div id="phone-number-section" className="bg-white rounded-xl border border-border p-5">
      <p className="text-xs text-muted font-medium mb-3">Phone Number</p>

      {showManual || !canProvision ? (
        <div>
          <div className="flex items-center gap-2">
            <input
              type="tel"
              value={manualPhone}
              onChange={(e) => { setManualPhone(e.target.value); setManualError('') }}
              placeholder="+15551234567"
              className={`px-2 py-1 border rounded-lg bg-white text-ink text-sm focus:ring-2 focus:ring-accent focus:border-transparent outline-none w-40 ${manualError ? 'border-red-400' : 'border-border'}`}
              autoFocus={showManual}
            />
            <button
              onClick={() => void handleManualSave()}
              disabled={isSavingManual}
              className="text-xs text-accent hover:text-accent/80 font-medium disabled:opacity-50"
            >
              {isSavingManual ? 'Saving...' : 'Save'}
            </button>
            {canProvision && showManual && (
              <button
                onClick={() => { setShowManual(false); setManualPhone(''); setManualError('') }}
                className="text-xs text-muted hover:text-ink font-medium"
              >
                Cancel
              </button>
            )}
          </div>
          {manualError && <p className="text-xs text-red-500 mt-1">{manualError}</p>}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button
            onClick={() => void handleProvision()}
            className="bg-accent text-white px-4 py-2 rounded-lg text-sm hover:bg-accent/90 font-medium transition-colors"
          >
            Get a phone number
          </button>
          <span className="text-xs text-muted">or</span>
          <button
            onClick={() => setShowManual(true)}
            className="text-xs text-accent hover:text-accent/80 font-medium transition-colors"
          >
            I have my own number
          </button>
        </div>
      )}
    </div>
  )
}
