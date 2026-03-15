'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChatMessage, type Message } from './ChatMessage'
import { ConfigPreview, type AgentConfig } from './ConfigPreview'
import { cn } from '@/lib/utils'

interface BuilderResponse {
  conversationId: string
  response: string
  messages: Message[]
}

interface GenerateResponse {
  config: AgentConfig
}

interface DeployResponse {
  agent: { id: string }
  error?: string
}

const INITIAL_MESSAGE: Message = {
  role: 'assistant',
  content:
    "Hi! I'm here to help you set up your voice agent. Let's start with the basics — what's the name of your business and what do you do?",
}

export function BuilderChat() {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedConfig, setGeneratedConfig] = useState<AgentConfig | null>(null)
  const [isDeploying, setIsDeploying] = useState(false)
  const [agentName, setAgentName] = useState('')
  const [showConfigMobile, setShowConfigMobile] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Count only the user + assistant exchanges (excluding the initial greeting)
  const exchangeCount = messages.filter((m) => m.role === 'user').length

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  async function handleSend() {
    const text = input.trim()
    if (!text || isSending) return

    const userMessage: Message = { role: 'user', content: text }
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsSending(true)

    // Reset textarea height
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
        }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to send message')
      }

      const data = (await res.json()) as BuilderResponse
      setConversationId(data.conversationId)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.response },
      ])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      toast.error(message)
      // Revert the optimistic user message
      setMessages((prev) => prev.slice(0, -1))
      setInput(text)
    } finally {
      setIsSending(false)
    }
  }

  async function handleGenerate() {
    if (!conversationId || isGenerating) return
    setIsGenerating(true)

    try {
      const res = await fetch('/api/builder/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to generate config')
      }

      const data = (await res.json()) as GenerateResponse
      setGeneratedConfig(data.config)
      toast.success('Configuration generated!')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      toast.error(message)
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleDeploy() {
    if (!generatedConfig || !agentName.trim() || !conversationId || isDeploying) return
    setIsDeploying(true)

    try {
      const businessName =
        generatedConfig.business_name ?? agentName.trim()

      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: agentName.trim(),
          businessName,
          config: generatedConfig,
        }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to create agent')
      }

      const data = (await res.json()) as DeployResponse
      toast.success('Agent created successfully!')
      router.push(`/dashboard/agents/${data.agent.id}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      toast.error(message)
    } finally {
      setIsDeploying(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    // Auto-grow textarea
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  return (
    <div className="flex gap-6 h-full">
      {/* Chat panel */}
      <div className="flex flex-col flex-1 bg-white rounded-xl border border-border overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-serif text-base text-ink">Agent Builder</h2>
            <p className="text-xs text-muted mt-0.5">
              Answer a few questions to configure your voice agent
            </p>
          </div>
          {/* Mobile config toggle */}
          <button
            onClick={() => setShowConfigMobile((v) => !v)}
            className="lg:hidden text-xs text-accent font-medium"
          >
            {showConfigMobile ? 'Hide config' : 'View config'}
          </button>
        </div>

        {/* Mobile config panel */}
        {showConfigMobile && (
          <div className="lg:hidden p-4 border-b border-border bg-cream">
            <ConfigPreview config={generatedConfig} />
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {messages.map((msg, i) => (
            <ChatMessage key={i} message={msg} />
          ))}
          {isSending && (
            <div className="self-start">
              <div className="bg-white border border-border rounded-2xl rounded-bl-md px-4 py-3">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce [animation-delay:300ms]" />
                </span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Action bar above input */}
        {exchangeCount >= 4 && !generatedConfig && (
          <div className="px-5 py-3 border-t border-border bg-cream flex-shrink-0">
            <button
              onClick={() => void handleGenerate()}
              disabled={isGenerating || !conversationId}
              className="bg-accent text-white px-4 py-2 rounded-lg text-sm hover:bg-accent/90 font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isGenerating ? 'Generating…' : 'Generate Configuration'}
            </button>
            <p className="text-xs text-muted mt-1">
              Ready to turn this conversation into an agent config.
            </p>
          </div>
        )}

        {/* Deploy form */}
        {generatedConfig && (
          <div className="px-5 py-4 border-t border-border bg-cream flex-shrink-0 space-y-3">
            <p className="text-sm font-medium text-ink">Deploy your agent</p>
            <div className="flex gap-3">
              <input
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="Agent name, e.g. Smile Dental Reception"
                className="flex-1 px-3 py-2 border border-border rounded-lg bg-white text-ink text-sm focus:ring-2 focus:ring-accent focus:border-transparent outline-none"
              />
              <button
                onClick={() => void handleDeploy()}
                disabled={isDeploying || !agentName.trim()}
                className="bg-accent text-white px-4 py-2 rounded-lg text-sm hover:bg-accent/90 font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap flex-shrink-0"
              >
                {isDeploying ? 'Saving…' : 'Save Agent'}
              </button>
            </div>
          </div>
        )}

        {/* Input area */}
        <div className={cn(
          'px-5 py-4 border-t border-border flex gap-3 items-end flex-shrink-0',
          generatedConfig && 'opacity-50 pointer-events-none'
        )}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            rows={1}
            disabled={isSending || !!generatedConfig}
            className="flex-1 px-3 py-2 border border-border rounded-lg bg-white text-ink text-sm focus:ring-2 focus:ring-accent focus:border-transparent outline-none resize-none min-h-[40px] max-h-40 disabled:opacity-50"
          />
          <button
            onClick={() => void handleSend()}
            disabled={isSending || !input.trim() || !!generatedConfig}
            className="bg-ink text-cream px-4 py-2 rounded-lg text-sm hover:bg-ink/90 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            aria-label="Send message"
          >
            Send
          </button>
        </div>
      </div>

      {/* Config preview — desktop only */}
      <div className="hidden lg:block w-[40%] flex-shrink-0">
        <ConfigPreview config={generatedConfig} />
      </div>
    </div>
  )
}
