import { cn } from '@/lib/utils'

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ChatMessageProps {
  message: Message
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex flex-col gap-1 max-w-[80%]', isUser ? 'self-end items-end' : 'self-start items-start')}>
      <span className="text-xs text-muted px-1">
        {isUser ? 'You' : 'VoiceCraft'}
      </span>
      <div
        className={cn(
          'px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap',
          isUser
            ? 'bg-ink text-cream rounded-2xl rounded-br-md'
            : 'bg-white border border-border text-ink rounded-2xl rounded-bl-md'
        )}
      >
        {message.content}
      </div>
    </div>
  )
}
