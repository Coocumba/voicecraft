import { prisma, SubscriptionStatus } from "@voicecraft/db"

/** Get user's subscription with plan included. Returns null if none. */
export async function getUserSubscription(userId: string) {
  return prisma.subscription.findUnique({
    where: { userId },
    include: { plan: true },
  })
}

/** Get the current billing period's usage record for a user. */
export async function getCurrentUsageRecord(userId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  })
  if (!subscription) return null

  return prisma.usageRecord.findFirst({
    where: {
      subscriptionId: subscription.id,
      periodStart: { lte: new Date() },
      periodEnd: { gte: new Date() },
    },
    orderBy: { periodStart: "desc" },
  })
}

/** Check if the subscription blocks agent creation/deployment. */
export function isSubscriptionBlocked(status: SubscriptionStatus): boolean {
  return status === "PAUSED" || status === "CANCELED"
}

/** Pause all active agents for a user. */
export async function pauseUserAgents(userId: string) {
  await prisma.agent.updateMany({
    where: { userId, status: "ACTIVE" },
    data: { status: "PAUSED" },
  })
  // TODO: Tear down LiveKit dispatch rules for each paused agent
}

/** Resume paused agents for a user. */
export async function resumeUserAgents(userId: string) {
  await prisma.agent.updateMany({
    where: { userId, status: "PAUSED" },
    data: { status: "ACTIVE" },
  })
  // TODO: Re-create LiveKit dispatch rules for each resumed agent
}
