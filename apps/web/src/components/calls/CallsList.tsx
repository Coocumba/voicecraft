'use client'

import { useMemo, useState } from 'react'
import { CallCard, type CallCardData } from './CallCard'
import { CallsFilterBar, type OutcomeFilter } from './CallsFilterBar'

interface AgentOption {
  id: string
  name: string
}

interface CallsListProps {
  calls: CallCardData[]
  agents: AgentOption[]
}

export function CallsList({ calls, agents }: CallsListProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')
  const [selectedOutcome, setSelectedOutcome] = useState<OutcomeFilter>('ALL')

  const filtered = useMemo(() => {
    return calls.filter((call) => {
      if (selectedAgentId && call.agent.id !== selectedAgentId) return false
      if (selectedOutcome !== 'ALL' && call.outcome !== selectedOutcome) return false
      return true
    })
  }, [calls, selectedAgentId, selectedOutcome])

  return (
    <div>
      <div className="mb-5">
        <CallsFilterBar
          agents={agents}
          selectedAgentId={selectedAgentId}
          selectedOutcome={selectedOutcome}
          onAgentChange={setSelectedAgentId}
          onOutcomeChange={setSelectedOutcome}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          {calls.length === 0 ? (
            <>
              <p className="text-sm font-medium text-ink mb-1">No calls yet</p>
              <p className="text-sm text-muted">
                When callers reach your voice agents, call records will appear here.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">No calls match the selected filters.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((call) => (
            <CallCard key={call.id} call={call} />
          ))}
        </div>
      )}
    </div>
  )
}
