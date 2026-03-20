import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma, IntegrationProvider } from '@voicecraft/db'
import { getUserSubscription, getCurrentUsageRecord } from '@/lib/subscription'
import { TRIAL_MINUTES } from '@/lib/billing-constants'
import SettingsClient from './SettingsClient'
import type { CalendarStatus, SettingsClientProps } from './SettingsClient'
import type { UsageData } from '@/components/billing/BillingSection'

// ---------------------------------------------------------------------------
// Helpers — mirror the logic in the API routes so we can run it server-side
// without a network round-trip.
// ---------------------------------------------------------------------------

async function fetchBillingData(userId: string): Promise<UsageData | null> {
  try {
    const subscription = await getUserSubscription(userId)
    if (!subscription) return null

    const usageRecord = await getCurrentUsageRecord(userId, subscription.id)

    const isTrialing = subscription.status === 'TRIALING'
    const minutesIncluded = isTrialing
      ? TRIAL_MINUTES
      : (usageRecord?.minutesIncluded ?? subscription.plan.minutesIncluded)

    return {
      plan: {
        tier: subscription.planTier,
        name: subscription.plan.name,
        cycle: subscription.billingCycle,
        status: subscription.status,
        // Serialize Date → ISO string so the value is a plain serializable prop.
        currentPeriodStart: subscription.currentPeriodStart.toISOString(),
        currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
        trialEnd: subscription.trialEnd ? subscription.trialEnd.toISOString() : null,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
      usage: {
        minutesUsed: usageRecord?.minutesUsed ?? 0,
        minutesIncluded,
        overagePerMinute:
          usageRecord?.overagePerMinute ?? subscription.plan.overagePerMinute,
      },
    }
  } catch {
    // Non-fatal — the client component will show the error state.
    return null
  }
}

async function fetchGoogleStatus(userId: string): Promise<CalendarStatus> {
  const available = !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.NEXT_PUBLIC_APP_URL
  )

  if (!available) return { available: false, connected: false }

  try {
    const integration = await prisma.integration.findUnique({
      where: { userId_provider: { userId, provider: IntegrationProvider.GOOGLE_CALENDAR } },
      select: { metadata: true },
    })

    if (!integration) return { available: true, connected: false }

    const email = extractEmailFromMetadata(integration.metadata)
    return { available: true, connected: true, ...(email ? { email } : {}) }
  } catch {
    return { available: false, connected: false }
  }
}

async function fetchMicrosoftStatus(userId: string): Promise<CalendarStatus> {
  const available = !!(
    process.env.MICROSOFT_CLIENT_ID &&
    process.env.MICROSOFT_CLIENT_SECRET &&
    process.env.NEXT_PUBLIC_APP_URL
  )

  if (!available) return { available: false, connected: false }

  try {
    const integration = await prisma.integration.findUnique({
      where: { userId_provider: { userId, provider: IntegrationProvider.MICROSOFT_OUTLOOK } },
      select: { metadata: true },
    })

    if (!integration) return { available: true, connected: false }

    const email = extractEmailFromMetadata(integration.metadata)
    return { available: true, connected: true, ...(email ? { email } : {}) }
  } catch {
    return { available: false, connected: false }
  }
}

function extractEmailFromMetadata(metadata: unknown): string | undefined {
  if (
    metadata !== null &&
    typeof metadata === 'object' &&
    !Array.isArray(metadata) &&
    'accountEmail' in metadata &&
    typeof (metadata as Record<string, unknown>).accountEmail === 'string'
  ) {
    return (metadata as Record<string, string>).accountEmail
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id

  // Run all three data fetches in parallel — no sequential waterfall.
  const [billingData, googleStatus, microsoftStatus] = await Promise.all([
    fetchBillingData(userId),
    fetchGoogleStatus(userId),
    fetchMicrosoftStatus(userId),
  ])

  const props: SettingsClientProps = {
    // Pass null explicitly when the subscription doesn't exist so the client
    // component knows the fetch was attempted (and won't re-fetch).
    initialBillingData: billingData,
    initialGoogleStatus: googleStatus,
    initialMicrosoftStatus: microsoftStatus,
  }

  return <SettingsClient {...props} />
}
