import { getSession } from '@/auth'
import { prisma, MessagingStatus, MessageChannel } from '@voicecraft/db'
import { TopBar } from '@/components/layout/TopBar'
import { SubscriptionBanner } from '@/components/billing/SubscriptionBanner'
import { TimezoneSync } from '@/components/providers/TimezoneSync'

export default async function ShellLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()

  // Fetch the unread message count server-side so TopBar doesn't need a
  // client-side fetch on every navigation.
  let initialUnreadCount = 0
  if (session?.user?.id) {
    try {
      initialUnreadCount = await prisma.conversation.count({
        where: {
          agent: { userId: session.user.id, whatsappEnabled: true },
          status: MessagingStatus.NEEDS_REPLY,
          channel: MessageChannel.WHATSAPP,
        },
      })
    } catch {
      // Non-fatal — TopBar badge will start at 0 and can refresh client-side.
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <TimezoneSync />
      <SubscriptionBanner />
      <TopBar
        userName={session?.user?.name}
        userEmail={session?.user?.email}
        initialUnreadCount={initialUnreadCount}
      />
      <main className="flex-1">
        {children}
      </main>
    </div>
  )
}
