'use client'

interface CalendarConnectButtonsProps {
  returnTo: string
  googleAvailable?: boolean
  microsoftAvailable?: boolean
}

export function CalendarConnectButtons({
  returnTo,
  googleAvailable = true,
  microsoftAvailable = true,
}: CalendarConnectButtonsProps) {
  const encoded = encodeURIComponent(returnTo)

  if (!googleAvailable && !microsoftAvailable) return null

  return (
    <div className="flex flex-wrap gap-2">
      {googleAvailable && (
        <a
          href={`/api/integrations/google?returnTo=${encoded}`}
          className="inline-flex items-center gap-2 bg-white border border-border px-4 py-2 rounded-lg text-sm font-medium text-ink hover:bg-cream transition-colors"
        >
          Google Calendar
        </a>
      )}
      {microsoftAvailable && (
        <a
          href={`/api/integrations/microsoft?returnTo=${encoded}`}
          className="inline-flex items-center gap-2 bg-white border border-border px-4 py-2 rounded-lg text-sm font-medium text-ink hover:bg-cream transition-colors"
        >
          Microsoft Outlook
        </a>
      )}
    </div>
  )
}
