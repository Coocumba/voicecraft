'use client'

import { useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { ConversationList } from '@/components/messages/ConversationList'
import { MessageThread } from '@/components/messages/MessageThread'

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

interface Agent {
  id: string
  name: string
}

interface MessageItem {
  id: string
  direction: string
  sender: string
  body: string
  createdAt: string
}

interface MessagesClientProps {
  conversations: ConversationSummary[]
  agents: Agent[]
}

export function MessagesClient({ conversations, agents }: MessagesClientProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageItem[]>([])
  const [isSending, setIsSending] = useState(false)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [agentFilter, setAgentFilter] = useState<string>('all')

  const selectedConversation = conversations.find((c) => c.id === selectedId)

  const filteredConversations = useMemo(
    () =>
      agentFilter === 'all'
        ? conversations
        : conversations.filter((c) => c.agentId === agentFilter),
    [agentFilter, conversations]
  )

  const handleSelect = useCallback(async (id: string) => {
    setSelectedId(id)
    setIsLoadingMessages(true)
    try {
      const res = await fetch(`/api/messages/${id}`)
      if (!res.ok) throw new Error('Failed to load messages')
      const data = (await res.json()) as { conversation: { messages: MessageItem[] } }
      setMessages(data.conversation.messages)
    } catch {
      toast.error('Failed to load messages')
      setMessages([])
    } finally {
      setIsLoadingMessages(false)
    }
  }, [])

  async function handleSendReply(body: string) {
    if (!selectedId) return
    setIsSending(true)
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: selectedId, body }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to send message')
      }
      const data = (await res.json()) as { message: MessageItem }
      setMessages((prev) => [...prev, data.message])
      toast.success('Message sent')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setIsSending(false)
    }
  }

  function handleBack() {
    setSelectedId(null)
    setMessages([])
  }

  if (conversations.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-border p-10 text-center">
        <p className="text-sm text-muted">No messages yet. When customers text your agent&apos;s number, conversations will appear here.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Agent filter */}
      {agents.length > 1 && (
        <div className="mb-4">
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="bg-white border border-border rounded-lg px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            <option value="all">All agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="bg-white rounded-xl border border-border overflow-hidden flex h-[600px]">
        {/* Left pane: conversation list */}
        <div className={`w-full sm:w-80 sm:min-w-[320px] border-r border-border overflow-y-auto ${selectedId ? 'hidden sm:block' : 'block'}`}>
          <ConversationList
            conversations={filteredConversations}
            selectedId={selectedId}
            onSelect={(id) => void handleSelect(id)}
            showAgentName={agents.length > 1}
          />
        </div>

        {/* Right pane: message thread or empty state */}
        <div className={`flex-1 flex flex-col ${selectedId ? 'block' : 'hidden sm:flex'}`}>
          {selectedId && selectedConversation ? (
            isLoadingMessages ? (
              <div className="flex-1 flex items-center justify-center">
                <span className="inline-block h-5 w-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <MessageThread
                messages={messages}
                customerPhone={selectedConversation.customerPhone}
                onSendReply={(body) => handleSendReply(body)}
                isSending={isSending}
                onBack={handleBack}
              />
            )
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-muted">Select a conversation to view messages</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
