import Markdown, { type Components } from 'react-markdown'

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ChatMessageProps {
  message: Message
}

function AssistantAvatar() {
  return (
    <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
      <svg className="w-3.5 h-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
      </svg>
    </div>
  )
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="bg-accent/10 text-ink rounded-2xl rounded-br-md px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap max-w-[80%]">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2.5 items-start">
      <AssistantAvatar />
      <div className="flex flex-col gap-1 max-w-[80%]">
        <span className="text-xs text-muted font-medium pl-1">Craft</span>
        <div className="bg-white border border-border rounded-2xl rounded-tl-md px-4 py-3 text-sm leading-relaxed">
          <Markdown
            components={{
              p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,
              strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold">{children}</strong>,
              em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
              ul: ({ children }: { children?: React.ReactNode }) => <ul className="list-disc pl-4 mb-2 last:mb-0 space-y-1">{children}</ul>,
              ol: ({ children }: { children?: React.ReactNode }) => <ol className="list-decimal pl-4 mb-2 last:mb-0 space-y-1">{children}</ol>,
              li: ({ children }: { children?: React.ReactNode }) => <li>{children}</li>,
              code: ({ children }: { children?: React.ReactNode }) => (
                <code className="bg-cream px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
              ),
              h1: ({ children }: { children?: React.ReactNode }) => <p className="font-serif font-medium text-base mb-2">{children}</p>,
              h2: ({ children }: { children?: React.ReactNode }) => <p className="font-serif font-medium text-base mb-2">{children}</p>,
              h3: ({ children }: { children?: React.ReactNode }) => <p className="font-medium mb-1">{children}</p>,
              a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
                <a href={href} className="text-accent underline" target="_blank" rel="noopener noreferrer">{children}</a>
              ),
            } satisfies Components}
          >
            {message.content}
          </Markdown>
        </div>
      </div>
    </div>
  )
}
