'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChatMessage, type Message } from './ChatMessage'
import { InlineSummaryCard } from './InlineSummaryCard'
import type { AgentConfig } from '@/lib/builder-types'

interface BuilderChatProps {
  initialMessage?: string
  conversationId?: string
  agentId?: string
  agentName?: string
  editMode?: boolean
  onTopicsChange?: (count: number) => void
}

interface MessageResponse {
  conversationId: string
  response: string
  messages: Message[]
  topicsCovered: number
  ready: boolean
}

interface GenerateResponse {
  config: AgentConfig
}

const NEW_GREETING =
  "Hi! I'm here to help you set up your voice agent. Tell me about your business — what do you do and what's it called?"

function editGreeting(name?: string): string {
  if (name) {
    return `Welcome back! You're editing **${name}**. What would you like to change?`
  }
  return "Welcome back! I already have your agent's current setup. Just tell me what you'd like to change."
}

export function BuilderChat({
  initialMessage,
  conversationId: initialConversationId,
  agentId,
  agentName,
  editMode = false,
  onTopicsChange,
}: BuilderChatProps) {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: editMode ? editGreeting(agentName) : NEW_GREETING },
  ])
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId ?? null
  )
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [generatedConfig, setGeneratedConfig] = useState<AgentConfig | null>(null)
  const [topicsCovered, setTopicsCovered] = useState(0)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const didAutoSend = useRef(false)
  const didAttemptGenerate = useRef(false)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Auto-send the initial message (from empty state or edit mode) once on mount
  useEffect(() => {
    if (initialMessage && !didAutoSend.current) {
      didAutoSend.current = true
      void sendMessage(initialMessage)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function sendMessage(text: string) {
    if (!text.trim() || isSending) return

    const userMessage: Message = { role: 'user', content: text }
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsSending(true)

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    try {
      const res = await fetch('/api/builder/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          ...(conversationId ? { conversationId } : {}),
          ...(editMode && agentId ? { agentId } : {}),
        }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to send message')
      }

      const data = (await res.json()) as MessageResponse
      setConversationId(data.conversationId)
      setTopicsCovered(data.topicsCovered)
      onTopicsChange?.(data.topicsCovered)
      setMessages((prev) => [...prev, { role: 'assistant', content: data.response }])

      // AI signalled readiness — auto-generate config
      if (data.ready && !generatedConfig && !didAttemptGenerate.current) {
        didAttemptGenerate.current = true
        await generateConfig(data.conversationId)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      toast.error(message)
      setMessages((prev) => prev.slice(0, -1))
      setInput(text)
    } finally {
      setIsSending(false)
    }
  }

  async function generateConfig(convId: string) {
    setIsGenerating(true)
    try {
      const res = await fetch('/api/builder/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: convId }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to generate configuration')
      }

      const data = (await res.json()) as GenerateResponse
      setGeneratedConfig(data.config)
      // Set to 5 to signal completion in ProgressDots
      setTopicsCovered(5)
      onTopicsChange?.(5)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate configuration'
      toast.error(message)
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleSave() {
    if (!generatedConfig || isSaving) return
    setIsSaving(true)

    const businessName = generatedConfig.business_name ?? 'My Agent'

    try {
      if (editMode && agentId) {
        // Update existing agent
        const res = await fetch(`/api/agents/${agentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessName,
            config: generatedConfig,
          }),
        })
        if (!res.ok) {
          const data = (await res.json()) as { error?: string }
          throw new Error(data.error ?? 'Failed to update agent')
        }
        toast.success('Agent updated!')
        router.push(`/dashboard/voice-agents/${agentId}`)
      } else {
        // Create new agent
        const res = await fetch('/api/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: businessName,
            businessName,
            config: generatedConfig,
            ...(conversationId ? { conversationId } : {}),
          }),
        })
        if (!res.ok) {
          const data = (await res.json()) as { error?: string }
          throw new Error(data.error ?? 'Failed to create agent')
        }
        const data = (await res.json()) as { agent: { id: string } }
        toast.success('Agent created!')
        router.push(`/dashboard/voice-agents/${data.agent.id}/connect-calendar`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage(input)
    }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  const inputDisabled = isSending || isGenerating || !!generatedConfig

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="flex flex-col gap-4 min-h-full justify-end">
          {messages.map((msg, i) => (
            <ChatMessage key={i} message={msg} />
          ))}

          {/* Generating indicator */}
          {isGenerating && (
            <div className="self-start">
              <div className="bg-cream rounded-2xl rounded-bl-md px-4 py-3">
                <span className="text-xs text-muted">Setting up your agent…</span>
              </div>
            </div>
          )}

          {/* Typing indicator */}
          {isSending && !isGenerating && (
            <div className="self-start">
              <div className="bg-cream rounded-2xl rounded-bl-md px-4 py-3">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce [animation-delay:300ms]" />
                </span>
              </div>
            </div>
          )}

          {/* Inline summary + CTA */}
          {generatedConfig && (
            <div className="self-start w-full max-w-[80%]">
              <InlineSummaryCard config={generatedConfig} />
              <button
                onClick={() => void handleSave()}
                disabled={isSaving}
                className="w-full bg-accent text-white py-3 rounded-xl font-medium text-sm hover:bg-accent/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              >
                {isSaving
                  ? editMode ? 'Saving changes…' : 'Creating agent…'
                  : editMode ? 'Save changes' : 'Create Agent'}
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className={`px-4 sm:px-5 py-3 border-t border-border flex-shrink-0 bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))] ${inputDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="flex gap-2 items-end bg-cream/50 border border-border rounded-xl px-3 py-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            rows={1}
            disabled={inputDisabled}
            className="flex-1 bg-transparent text-ink text-sm focus:outline-none resize-none min-h-[36px] max-h-40 placeholder:text-muted"
          />
          <button
            onClick={() => void sendMessage(input)}
            disabled={inputDisabled || !input.trim()}
            className="bg-accent text-white p-2 rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            aria-label="Send message"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
