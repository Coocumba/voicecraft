'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BuilderChat } from './BuilderChat'
import { ProgressDots } from '@/components/ui/ProgressDots'

interface NewVoiceAgentClientProps {
  initialMessage?: string
  conversationId?: string
  agentId?: string
  agentName?: string
  editMode?: boolean
  isLive?: boolean
}

export function NewVoiceAgentClient({
  initialMessage,
  conversationId,
  agentId,
  agentName,
  editMode,
  isLive,
}: NewVoiceAgentClientProps) {
  const [topicsCovered, setTopicsCovered] = useState(0)

  return (
    <div className="flex flex-col h-screen">
      {/* Focused top bar */}
      <div className="bg-white border-b border-border h-14 flex items-center px-4 sm:px-6 flex-shrink-0">
        {/* Left — back link */}
        <div className="flex-1 flex items-center">
          <Link
            href="/voice-agents"
            className="text-sm text-muted hover:text-ink transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            <span className="hidden sm:inline">Voice Agents</span>
          </Link>
        </div>

        {/* Center — title */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-accent/10 flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
            </svg>
          </div>
          <span className="text-sm font-medium text-ink">
            {editMode ? (agentName ?? 'Edit Agent') : 'New Agent'}
          </span>
        </div>

        {/* Right — progress */}
        <div className="flex-1 flex justify-end">
          {!editMode && <ProgressDots total={5} current={topicsCovered} />}
          {editMode && (
            <span className="text-xs text-muted bg-cream px-2 py-1 rounded-md">Editing</span>
          )}
        </div>
      </div>

      {/* Live agent warning */}
      {editMode && isLive && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2.5 flex items-center gap-2">
          <span className="text-amber-600 text-xs font-medium">This agent is live and handling calls. Changes will apply to the next call.</span>
        </div>
      )}

      {/* Chat fills remaining height */}
      <div className="flex-1 min-h-0">
        <BuilderChat
          initialMessage={initialMessage}
          conversationId={conversationId}
          agentId={agentId}
          agentName={agentName}
          editMode={editMode}
          onTopicsChange={setTopicsCovered}
        />
      </div>
    </div>
  )
}
