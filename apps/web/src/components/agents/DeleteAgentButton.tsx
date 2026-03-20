'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface DeleteAgentButtonProps {
  agentId: string
  agentName: string
}

export function DeleteAgentButton({ agentId, agentName }: DeleteAgentButtonProps) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleDelete() {
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/agents/${agentId}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to delete agent')
      }
      toast.success(`${agentName} deleted`)
      router.push('/voice-agents')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsDeleting(false)
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-3">
        <p className="text-sm text-red-600">Delete {agentName}? This cannot be undone.</p>
        <button
          onClick={() => void handleDelete()}
          disabled={isDeleting}
          className="text-sm text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
        >
          {isDeleting ? 'Deleting...' : 'Yes, delete'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-sm text-muted hover:text-ink font-medium"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-sm text-red-600 hover:text-red-700 font-medium transition-colors"
    >
      Delete agent
    </button>
  )
}
