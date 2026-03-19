'use client'

import { cn } from '@/lib/utils'
import type { CallOutcomeValue } from './CallCard'

export type OutcomeFilter = CallOutcomeValue | 'ALL'

interface AgentOption {
  id: string
  name: string
}

interface CallsFilterBarProps {
  agents: AgentOption[]
  selectedAgentId: string
  selectedOutcome: OutcomeFilter
  onAgentChange: (agentId: string) => void
  onOutcomeChange: (outcome: OutcomeFilter) => void
}

const OUTCOME_PILLS: { value: OutcomeFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'MISSED', label: 'Missed' },
  { value: 'ESCALATED', label: 'Escalated' },
]

export function CallsFilterBar({
  agents,
  selectedAgentId,
  selectedOutcome,
  onAgentChange,
  onOutcomeChange,
}: CallsFilterBarProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
      {/* Agent dropdown */}
      <div className="relative w-fit">
        <label htmlFor="agent-filter" className="sr-only">
          Filter by agent
        </label>
        <select
          id="agent-filter"
          value={selectedAgentId}
          onChange={(e) => onAgentChange(e.target.value)}
          className="appearance-none w-auto bg-white border border-border rounded-lg pl-3 pr-8 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors cursor-pointer"
        >
          <option value="">All agents</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
        <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
      </div>

      {/* Outcome pills */}
      <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filter by outcome">
        {OUTCOME_PILLS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onOutcomeChange(value)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-colors',
              selectedOutcome === value
                ? 'bg-accent text-white'
                : 'bg-white border border-border text-muted hover:text-ink hover:border-ink/30'
            )}
            aria-pressed={selectedOutcome === value}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
