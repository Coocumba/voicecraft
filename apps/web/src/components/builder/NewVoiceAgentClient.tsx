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
      <div className="bg-white border-b border-border h-14 flex items-center justify-between px-4 sm:px-6 flex-shrink-0">
        <Link
          href="/dashboard/voice-agents"
          className="text-sm text-muted hover:text-ink transition-colors flex items-center gap-1.5"
        >
          <span aria-hidden="true">←</span>
          Voice Agents
        </Link>
        {!editMode && <ProgressDots total={5} current={topicsCovered} />}
        {editMode && <span className="text-xs text-muted">Editing</span>}
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
