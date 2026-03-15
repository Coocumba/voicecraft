'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface DeployButtonProps {
  agentId: string
  currentStatus: string
}

export function DeployButton({ agentId, currentStatus }: DeployButtonProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const isActive = currentStatus === 'ACTIVE'

  async function handleToggle() {
    setIsLoading(true)
    try {
      if (isActive) {
        // Deactivate
        const res = await fetch(`/api/agents/${agentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'INACTIVE' }),
        })
        if (!res.ok) {
          const data = (await res.json()) as { error?: string }
          throw new Error(data.error ?? 'Failed to deactivate agent')
        }
        toast.success('Agent deactivated')
      } else {
        // Deploy / activate
        const res = await fetch(`/api/agents/${agentId}/deploy`, {
          method: 'POST',
        })
        if (!res.ok) {
          const data = (await res.json()) as { error?: string }
          throw new Error(data.error ?? 'Failed to deploy agent')
        }
        toast.success('Agent deployed!')
      }
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <button
      onClick={() => void handleToggle()}
      disabled={isLoading}
      className={
        isActive
          ? 'bg-white text-red-600 px-4 py-2 rounded-lg text-sm border border-red-200 hover:bg-red-50 font-medium transition-colors disabled:opacity-60'
          : 'bg-accent text-white px-4 py-2 rounded-lg text-sm hover:bg-accent/90 font-medium transition-colors disabled:opacity-60'
      }
    >
      {isLoading
        ? (isActive ? 'Deactivating…' : 'Deploying…')
        : (isActive ? 'Deactivate' : 'Deploy Agent')
      }
    </button>
  )
}
