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
    <div className="flex gap-2">
      {googleAvailable && (
        <a
          href={`/api/integrations/google?returnTo=${encoded}`}
          className="inline-flex items-center justify-center whitespace-nowrap bg-accent text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          Google Calendar
        </a>
      )}
      {microsoftAvailable && (
        <a
          href={`/api/integrations/microsoft?returnTo=${encoded}`}
          className="inline-flex items-center justify-center whitespace-nowrap bg-accent text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          Microsoft Outlook
        </a>
      )}
    </div>
  )
}
