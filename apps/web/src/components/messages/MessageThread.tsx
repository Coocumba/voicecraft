'use client'

import { useState, useRef, useEffect } from 'react'
import { formatPhone } from '@/lib/format-utils'
import { cn } from '@/lib/utils'

interface MessageItem {
  id: string
  direction: string
  sender: string
  body: string
  createdAt: string
}

interface MessageThreadProps {
  messages: MessageItem[]
  customerPhone: string
  onSendReply: (body: string) => Promise<void>
  isSending: boolean
  onBack?: () => void
}

function senderLabel(sender: string): string {
  switch (sender) {
    case 'CUSTOMER': return 'Customer'
    case 'BOT': return 'Bot'
    case 'OWNER': return 'You'
    default: return sender
  }
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function MessageThread({
  messages,
  customerPhone,
  onSendReply,
  isSending,
  onBack,
}: MessageThreadProps) {
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return
    setDraft('')
    await onSendReply(body)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="sm:hidden text-muted hover:text-ink transition-colors text-sm"
            aria-label="Back to conversations"
          >
            <span aria-hidden="true">&larr;</span>
          </button>
        )}
        <p className="text-sm font-medium text-ink">{formatPhone(customerPhone)}</p>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => {
          const isCustomer = msg.sender === 'CUSTOMER'
          return (
            <div
              key={msg.id}
              className={cn('flex flex-col max-w-[75%]', isCustomer ? 'items-start' : 'items-end ml-auto')}
            >
              <span className="text-[10px] text-muted mb-0.5 px-1">{senderLabel(msg.sender)}</span>
              <div
                className={cn(
                  'px-3 py-2 rounded-lg text-sm',
                  isCustomer && 'bg-border/30 text-ink',
                  msg.sender === 'BOT' && 'bg-accent/10 text-ink',
                  msg.sender === 'OWNER' && 'bg-accent text-white'
                )}
              >
                {msg.body}
              </div>
              <span className="text-[10px] text-muted mt-0.5 px-1">{formatTime(msg.createdAt)}</span>
            </div>
          )
        })}
      </div>

      {/* Input */}
      <form onSubmit={(e) => void handleSubmit(e)} className="border-t border-border px-4 py-3 flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a reply..."
          className="flex-1 bg-cream border border-border rounded-lg px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30"
          disabled={isSending}
        />
        <button
          type="submit"
          disabled={isSending || !draft.trim()}
          className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
        >
          {isSending ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  )
}
