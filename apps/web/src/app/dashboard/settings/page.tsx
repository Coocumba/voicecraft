import { auth } from '@/auth'
import { redirect } from 'next/navigation'

function maskApiKey(key: string | undefined): string {
  if (!key) return 'Not configured'
  if (key.length <= 8) return '••••••••'
  return key.slice(0, 4) + '••••••••' + key.slice(-4)
}

interface SettingCardProps {
  title: string
  description: string
  children: React.ReactNode
}

function SettingCard({ title, description, children }: SettingCardProps) {
  return (
    <div className="bg-white rounded-xl border border-border p-6">
      <div className="mb-5">
        <h2 className="font-serif text-base text-ink">{title}</h2>
        <p className="text-sm text-muted mt-1">{description}</p>
      </div>
      {children}
    </div>
  )
}

function ComingSoonBadge() {
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-muted/15 text-muted">
      Coming soon
    </span>
  )
}

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const maskedApiKey = maskApiKey(process.env.VOICECRAFT_API_KEY)

  return (
    <div className="p-6 sm:p-8 max-w-3xl mx-auto">
      <h1 className="font-serif text-2xl sm:text-3xl text-ink mb-8">Settings</h1>

      <div className="space-y-5">
        {/* API Key */}
        <SettingCard
          title="API Key"
          description="Used by the VoiceCraft agent worker to authenticate requests."
        >
          <div className="flex items-center justify-between p-3 bg-cream rounded-lg border border-border">
            <span className="text-sm font-mono text-ink">{maskedApiKey}</span>
            <span className="text-xs text-muted">VOICECRAFT_API_KEY</span>
          </div>
          <p className="text-xs text-muted mt-2">
            Set this in your <code className="font-mono bg-cream px-1 rounded">.env.local</code> file.
            Never expose this key in client-side code.
          </p>
        </SettingCard>

        {/* Google Calendar */}
        <SettingCard
          title="Google Calendar"
          description="Automatically create calendar events when appointments are booked."
        >
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm text-ink">Connect your Google Calendar</p>
              <p className="text-xs text-muted">
                Sync booked appointments directly to your calendar.
              </p>
            </div>
            <ComingSoonBadge />
          </div>
        </SettingCard>

        {/* Twilio */}
        <SettingCard
          title="Twilio"
          description="Configure a phone number to receive inbound calls for your agents."
        >
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm text-ink">Connect Twilio account</p>
              <p className="text-xs text-muted">
                Assign real phone numbers to your agents via Twilio.
              </p>
            </div>
            <ComingSoonBadge />
          </div>
        </SettingCard>

        {/* Account info */}
        <SettingCard
          title="Account"
          description="Your account details."
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Name</span>
              <span className="text-ink">{session.user?.name ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Email</span>
              <span className="text-ink">{session.user?.email ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">User ID</span>
              <span className="text-ink font-mono text-xs">{session.user?.id ?? '—'}</span>
            </div>
          </div>
        </SettingCard>
      </div>
    </div>
  )
}
