'use client'

import { useSession } from 'next-auth/react'
import Link from 'next/link'

export function SubscriptionBanner() {
  const { data: session } = useSession()
  const status = session?.user?.subscriptionStatus

  if (!status || status === 'ACTIVE') {
    return null
  }

  if (status === 'TRIALING') {
    return (
      <div className="bg-accent/8 border-b border-accent/20 px-4 py-2.5">
        <p className="text-sm text-accent text-center">
          You are on a free trial.{' '}
          <Link
            href="/dashboard/settings"
            className="font-medium underline underline-offset-2 hover:text-accent/80 transition-colors"
          >
            Add a payment method
          </Link>{' '}
          to keep your agents running after the trial ends.
        </p>
      </div>
    )
  }

  if (status === 'PAUSED' || status === 'CANCELED') {
    return (
      <div className="bg-red-50 border-b border-red-200 px-4 py-2.5">
        <p className="text-sm text-red-700 text-center">
          Your subscription is inactive. Your agents are paused.{' '}
          <Link
            href="/dashboard/settings"
            className="font-medium underline underline-offset-2 hover:text-red-600 transition-colors"
          >
            Reactivate your subscription
          </Link>
          .
        </p>
      </div>
    )
  }

  if (status === 'PAST_DUE') {
    return (
      <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2.5">
        <p className="text-sm text-yellow-800 text-center">
          Payment failed.{' '}
          <Link
            href="/dashboard/settings"
            className="font-medium underline underline-offset-2 hover:text-yellow-700 transition-colors"
          >
            Update your payment method
          </Link>{' '}
          to restore service.
        </p>
      </div>
    )
  }

  return null
}
