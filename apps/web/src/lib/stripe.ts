import Stripe from "stripe"

/**
 * Stripe client singleton — lazy-initialized so the module can be imported
 * at build time without STRIPE_SECRET_KEY (e.g. during `next build` in Docker).
 * The key is only required when the client is actually used at runtime.
 */
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY environment variable is not set")
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-02-25.clover",
      typescript: true,
    })
  }
  return _stripe
}
