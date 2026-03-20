/**
 * Client-safe billing constants.
 *
 * These values apply uniformly across all plan tiers during the trial period.
 * They are safe to import in both server and client components — no Prisma,
 * no server-only imports.
 */

/** Maximum call minutes available during the free trial, regardless of tier. */
export const TRIAL_MINUTES = 60

/** Length of the free trial in days. */
export const TRIAL_DAYS = 14

/** Maximum number of agents allowed during the free trial, regardless of tier. */
export const TRIAL_MAX_AGENTS = 1
