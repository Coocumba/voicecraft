import NextAuth, { CredentialsSignin } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import bcrypt from "bcryptjs"
import { prisma } from "@voicecraft/db"

declare module "next-auth" {
  interface User {
    emailVerified?: Date | null
    subscriptionStatus?: string | null
    planTier?: string | null
    subscriptionVersion?: number
  }
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      emailVerified: Date | null
      subscriptionStatus: string | null
      planTier: string | null
    }
  }
}

export class EmailNotVerifiedError extends CredentialsSignin {
  code = "EMAIL_NOT_VERIFIED" as const
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      authorization: { params: { prompt: "select_account" } },
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        })

        if (!user || !user.passwordHash) return null

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        )

        if (!isValid) return null

        // Skip verification gate for the seeded demo account
        if (!user.emailVerified && user.email !== "admin@voicecraft.dev") {
          throw new EmailNotVerifiedError()
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerified: user.emailVerified ?? new Date(),
        }
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        const email = user.email
        if (!email) return false

        const upserted = await prisma.user.upsert({
          where: { email },
          update: {
            emailVerified: new Date(), // always ensure verified for Google users
          },
          create: {
            email,
            name: user.name ?? null,
            emailVerified: new Date(),
            passwordHash: null,
          },
        })

        user.id = upserted.id
        ;(user as { emailVerified?: Date | null }).emailVerified = upserted.emailVerified
      }
      return true
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id
        token.name = user.name
        token.emailVerified = (user as { emailVerified?: Date | null }).emailVerified ?? null

        // Fetch subscription data on sign-in only (runs in Node.js context).
        // The jwt callback also runs on every request via middleware (Edge Runtime),
        // where Prisma is NOT available. So we only do DB reads when `user` is
        // present (sign-in flow). Subscription status may be stale between sign-ins,
        // but real enforcement happens at the API route level (Node.js), not here.
        const sub = await prisma.subscription.findUnique({
          where: { userId: user.id as string },
          select: { status: true, planTier: true },
        })
        token.subscriptionStatus = sub?.status ?? null
        token.planTier = sub?.planTier ?? null
      }

      if (trigger === "update") {
        if (typeof session?.name === "string") {
          token.name = session.name
        }
        // Allow client-side session update to refresh subscription status
        // (e.g. after completing checkout, call update({ subscriptionStatus, planTier }))
        if (typeof session?.subscriptionStatus === "string") {
          token.subscriptionStatus = session.subscriptionStatus
        }
        if (typeof session?.planTier === "string") {
          token.planTier = session.planTier
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        if (typeof token.name === "string") {
          session.user.name = token.name
        }
        session.user.emailVerified = token.emailVerified
          ? new Date(token.emailVerified as string)
          : null
        session.user.subscriptionStatus = (token.subscriptionStatus as string) ?? null
        session.user.planTier = (token.planTier as string) ?? null
      }
      return session
    },
  },
})
