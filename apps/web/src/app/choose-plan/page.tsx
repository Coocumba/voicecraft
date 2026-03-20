import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@voicecraft/db'
import { ChoosePlanClient } from '@/components/billing/ChoosePlanClient'

export const dynamic = 'force-dynamic'

export default async function ChoosePlanPage() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/login')
  }

  // If the user already has a non-CANCELED subscription, send them to the dashboard
  const subscription = await prisma.subscription.findUnique({
    where: { userId: session.user.id },
    select: { status: true },
  })

  if (subscription && subscription.status !== 'CANCELED') {
    redirect('/home')
  }

  const plans = await prisma.plan.findMany({
    orderBy: { monthlyPrice: 'asc' },
    select: {
      id: true,
      tier: true,
      name: true,
      monthlyPrice: true,
      annualPricePerMonth: true,
      annualPriceTotal: true,
      minutesIncluded: true,
      overagePerMinute: true,
      maxAgents: true,
    },
  })

  return <ChoosePlanClient plans={plans} />
}
