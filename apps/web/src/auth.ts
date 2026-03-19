import NextAuth, { CredentialsSignin } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import bcrypt from "bcryptjs"
import { prisma } from "@voicecraft/db"

export class EmailNotVerifiedError extends CredentialsSignin {
  code = "EMAIL_NOT_VERIFIED" as const
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google,
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

        if (!user.emailVerified) throw new EmailNotVerifiedError()

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerified: user.emailVerified,
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

        const existing = await prisma.user.findUnique({ where: { email } })
        if (existing) {
          if (!existing.emailVerified) {
            await prisma.user.update({
              where: { email },
              data: { emailVerified: new Date() },
            })
          }
          user.id = existing.id
        } else {
          const created = await prisma.user.create({
            data: {
              email,
              name: user.name ?? null,
              emailVerified: new Date(),
              passwordHash: null,
            },
          })
          user.id = created.id
        }
      }
      return true
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id
        token.name = user.name
        token.emailVerified = (user as { emailVerified?: Date | null }).emailVerified ?? new Date()
      }
      if (trigger === "update" && typeof session?.name === "string") {
        token.name = session.name
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
      }
      return session
    },
  },
})
