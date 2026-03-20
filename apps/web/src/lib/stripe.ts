import Stripe from "stripe"

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY environment variable is not set")
}

/**
 * Stripe client singleton.
 *
 * Pinned to a specific API version so that Stripe's TypeScript types stay
 * consistent — changing the API version requires reviewing affected types.
 */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-02-25.clover",
  typescript: true,
})
