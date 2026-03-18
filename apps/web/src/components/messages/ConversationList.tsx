import { formatPhone } from '@/lib/format-utils'
import { cn } from '@/lib/utils'

interface ConversationSummary {
  id: string
  agentId: string
  customerPhone: string
  status: string
  lastMessageAt: string
  agentName: string
  lastMessage: {
    body: string
    sender: string
    createdAt: string
  } | null
}

interface ConversationListProps {
  conversations: ConversationSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
  showAgentName?: boolean
}

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`

  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`

  const diffDays = Math.floor(diffHr / 24)
  if (diffDays === 1) return 'Yesterday'

  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str
  return str.slice(0, len).trimEnd() + '...'
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  showAgentName = false,
}: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted">No conversations</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-border">
      {conversations.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c.id)}
          className={cn(
            'w-full text-left px-4 py-3 hover:bg-cream/50 transition-colors',
            c.id === selectedId && 'bg-accent/5'
          )}
        >
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-sm font-medium text-ink">
              {formatPhone(c.customerPhone)}
            </span>
            <span className="text-xs text-muted flex-shrink-0 ml-2">
              {relativeTime(c.lastMessageAt)}
            </span>
          </div>
          {c.lastMessage && (
            <p className="text-xs text-muted truncate">
              {truncate(c.lastMessage.body, 50)}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1">
            {showAgentName && (
              <span className="text-[10px] text-muted">{c.agentName}</span>
            )}
            {c.status === 'NEEDS_REPLY' && (
              <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold leading-none">
                Needs reply
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  )
}
