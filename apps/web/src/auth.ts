import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        // TODO: Replace with real database lookup
        // For now, use a demo user for development
        const demoUser = {
          id: "1",
          email: "admin@voicecraft.dev",
          name: "Admin",
          // password: "password123" hashed with bcrypt
          passwordHash: await bcrypt.hash("password123", 10),
        }

        if (credentials.email !== demoUser.email) return null

        const isValid = await bcrypt.compare(
          credentials.password as string,
          demoUser.passwordHash
        )

        if (!isValid) return null

        return {
          id: demoUser.id,
          email: demoUser.email,
          name: demoUser.name,
        }
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
      }
      return session
    },
  },
})
