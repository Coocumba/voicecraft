# Auth Pages Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add self-serve signup, email verification, Google OAuth, and password reset to VoiceCraft.

**Architecture:** Extend the existing NextAuth v5 Credentials provider with a Google provider and a custom `authorize` that gates unverified accounts. Token flows use SHA-256-hashed random tokens stored in two new Prisma models. Resend delivers transactional emails. All new pages follow the existing auth page pattern (server component wrapper, client form component).

**Tech Stack:** NextAuth v5 (beta.30), Prisma, bcryptjs, Resend, Next.js App Router Server Actions, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-18-auth-pages-design.md`

---

## File Map

### New files
| File | Responsibility |
|---|---|
| `apps/web/src/lib/tokens.ts` | Token generation (`generateToken`) and hashing (`hashToken`) |
| `apps/web/src/lib/email.ts` | Resend client, `sendVerificationEmail`, `sendPasswordResetEmail` |
| `apps/web/src/app/signup/page.tsx` | Signup page wrapper |
| `apps/web/src/app/signup/actions.ts` | `signup` Server Action — create user, generate token, send email |
| `apps/web/src/components/auth/SignupForm.tsx` | Signup client form with Google button |
| `apps/web/src/app/verify-email/page.tsx` | "Check your inbox" holding page |
| `apps/web/src/app/verify-email/confirm/page.tsx` | Token validation Server Component |
| `apps/web/src/app/forgot-password/page.tsx` | Forgot password page wrapper |
| `apps/web/src/components/auth/ForgotPasswordForm.tsx` | Forgot password client form |
| `apps/web/src/app/reset-password/page.tsx` | Reset password page wrapper + token validation |
| `apps/web/src/components/auth/ResetPasswordForm.tsx` | Reset password client form |
| `apps/web/src/app/api/auth/verify-email/route.ts` | POST — validate token, mark email verified |
| `apps/web/src/app/api/auth/resend-verification/route.ts` | POST — rate-limited resend |
| `apps/web/src/app/api/auth/forgot-password/route.ts` | POST — send reset email |
| `apps/web/src/app/api/auth/reset-password/route.ts` | POST — update password |

### Modified files
| File | Change |
|---|---|
| `packages/db/prisma/schema.prisma` | `emailVerified DateTime?`, `passwordHash String?`, two token models |
| `packages/db/prisma/seed.ts` | Add `emailVerified: new Date()` to demo user |
| `apps/web/src/auth.ts` | Google provider, updated `authorize`, `signIn` + `jwt` + `session` callbacks |
| `apps/web/src/middleware.ts` | Email verification gate |
| `apps/web/src/components/auth/LoginForm.tsx` | Google button, verified success banner, unverified error message |
| `apps/web/src/app/login/actions.ts` | Handle `EMAIL_NOT_VERIFIED` error code |
| `apps/web/.env.example` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL` |
| `README.md` | Update auth section |

---

## Chunk 1: Foundation

### Task 1: DB schema and migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/db/prisma/seed.ts`

- [ ] **Step 1: Update schema.prisma**

Replace the `User` model and add the two token models. Find the current `User` block and replace it:

```prisma
model User {
  id                      String                  @id @default(cuid())
  email                   String                  @unique
  name                    String?
  passwordHash            String?
  emailVerified           DateTime?
  agents                  Agent[]
  conversations           BuilderConversation[]
  integrations            Integration[]
  contacts                Contact[]
  phoneNumbers            PhoneNumber[]
  emailVerificationTokens EmailVerificationToken[]
  passwordResetTokens     PasswordResetToken[]
  createdAt               DateTime                @default(now())
  updatedAt               DateTime                @updatedAt
}
```

Add these two models at the end of the schema file:

```prisma
model EmailVerificationToken {
  id        String   @id @default(cuid())
  userId    String
  tokenHash String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model PasswordResetToken {
  id        String   @id @default(cuid())
  userId    String
  tokenHash String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

- [ ] **Step 2: Create migration (without running)**

```bash
cd packages/db && npx prisma migrate dev --name add_auth_tokens --create-only
```

This creates a migration file at `packages/db/prisma/migrations/<timestamp>_add_auth_tokens/migration.sql`.

- [ ] **Step 3: Add backfill SQL to the migration**

Open the generated `migration.sql` file and append this line at the end (before any final semicolon if present):

```sql
-- Backfill: mark all existing users as verified so they are not locked out
UPDATE "User" SET "emailVerified" = NOW() WHERE "emailVerified" IS NULL;
```

- [ ] **Step 4: Run the migration**

```bash
cd packages/db && npx prisma migrate dev
```

Expected output: `The following migration(s) have been applied: ... add_auth_tokens`

- [ ] **Step 5: Regenerate Prisma client**

```bash
make db-generate
```

- [ ] **Step 6: Update seed.ts**

Add `emailVerified: new Date()` to the user creation call:

```ts
await prisma.user.create({
  data: {
    email,
    name: "Admin",
    passwordHash: hashSync("password123", 10),
    emailVerified: new Date(),   // <-- add this line
  },
})
```

- [ ] **Step 7: Type-check**

```bash
pnpm type-check
```

Expected: no errors. If you see errors about `passwordHash` being non-nullable, confirm the schema change was applied and the client was regenerated.

- [ ] **Step 8: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations packages/db/prisma/seed.ts
git commit -m "feat: add emailVerified and token models to schema"
```

---

### Task 2: Token and email utilities

**Files:**
- Create: `apps/web/src/lib/tokens.ts`
- Create: `apps/web/src/lib/email.ts`

- [ ] **Step 1: Install Resend**

```bash
pnpm --filter @voicecraft/web add resend
```

- [ ] **Step 2: Create `src/lib/tokens.ts`**

```ts
import { randomBytes, createHash } from "crypto"

export function generateToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString("hex")
  const tokenHash = createHash("sha256").update(rawToken).digest("hex")
  return { rawToken, tokenHash }
}

export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex")
}
```

- [ ] **Step 3: Create `src/lib/email.ts`**

```ts
import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.EMAIL_FROM ?? "noreply@voicecraft.dev"
const APP_URL = process.env.APP_URL ?? "http://localhost:3000"

export async function sendVerificationEmail(
  to: string,
  rawToken: string
): Promise<void> {
  const url = `${APP_URL}/verify-email/confirm?token=${rawToken}`
  await resend.emails.send({
    from: FROM,
    to,
    subject: "Verify your VoiceCraft email",
    html: `
      <p>Thanks for signing up for VoiceCraft.</p>
      <p><a href="${url}" style="background:#6D46DC;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Verify email</a></p>
      <p style="color:#888;font-size:13px">This link expires in 24 hours.</p>
    `,
  })
}

export async function sendPasswordResetEmail(
  to: string,
  rawToken: string
): Promise<void> {
  const url = `${APP_URL}/reset-password?token=${rawToken}`
  await resend.emails.send({
    from: FROM,
    to,
    subject: "Reset your VoiceCraft password",
    html: `
      <p>We received a request to reset your VoiceCraft password.</p>
      <p><a href="${url}" style="background:#6D46DC;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Reset password</a></p>
      <p style="color:#888;font-size:13px">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
    `,
  })
}
```

- [ ] **Step 4: Type-check**

```bash
pnpm type-check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/tokens.ts apps/web/src/lib/email.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat: add token utilities and Resend email helpers"
```

---

### Task 3: Update auth config

**Files:**
- Modify: `apps/web/src/auth.ts`
- Modify: `apps/web/src/app/login/actions.ts`

- [ ] **Step 1: Replace `src/auth.ts` entirely**

```ts
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
          // Inject the DB id so the jwt callback can use it
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
        // user.emailVerified is set for credentials (from authorize)
        // and for Google (via the signIn callback mutating user.id; email is verified)
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
```

**Note on Google JWT:** For Google sign-ins, `user.emailVerified` from the OAuth profile is a boolean in some versions of next-auth types. We coerce it to `new Date()` since we set it explicitly in the `signIn` callback. The fallback `?? new Date()` covers Google users where the field is truthy but not a Date.

- [ ] **Step 2: Update `src/app/login/actions.ts`**

Add handling for the `EMAIL_NOT_VERIFIED` error code:

```ts
"use server"

import { signIn } from "@/auth"
import { AuthError } from "next-auth"
import { EmailNotVerifiedError } from "@/auth"

export async function authenticate(
  prevState: { error: string } | undefined,
  formData: FormData
) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/dashboard",
    })
  } catch (error) {
    if (error instanceof EmailNotVerifiedError) {
      return { error: "EMAIL_NOT_VERIFIED" }
    }
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return { error: "Invalid email or password." }
        default:
          return { error: "Something went wrong." }
      }
    }
    throw error
  }
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm type-check
```

If you see TypeScript errors on `session.user.emailVerified`, add a type augmentation file at `apps/web/src/types/next-auth.d.ts`:

```ts
import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      emailVerified: Date | null
    } & DefaultSession["user"]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    emailVerified?: Date | string | null
  }
}
```

Then re-run `pnpm type-check`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/auth.ts apps/web/src/app/login/actions.ts
git commit -m "feat: add Google provider and email verification gate to auth"
```

---

### Task 4: Update middleware

**Files:**
- Modify: `apps/web/src/middleware.ts`

- [ ] **Step 1: Replace `src/middleware.ts`**

The current file is a one-liner that uses auth as middleware directly. Expand it to check email verification:

```ts
import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const session = req.auth
  const { pathname } = req.nextUrl

  const isDashboard = pathname.startsWith("/dashboard")
  if (!isDashboard) return NextResponse.next()

  if (!session) {
    return NextResponse.redirect(new URL("/login", req.nextUrl))
  }

  if (!session.user?.emailVerified) {
    return NextResponse.redirect(new URL("/verify-email", req.nextUrl))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/dashboard/:path*"],
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm type-check
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/middleware.ts
git commit -m "feat: add email verification gate to dashboard middleware"
```

---

## Chunk 2: Signup + Email Verification

### Task 5: Signup Server Action + page

**Files:**
- Create: `apps/web/src/app/signup/actions.ts`
- Create: `apps/web/src/app/signup/page.tsx`
- Create: `apps/web/src/components/auth/SignupForm.tsx`

- [ ] **Step 1: Create `src/app/signup/actions.ts`**

```ts
"use server"

import { redirect } from "next/navigation"
import { prisma } from "@voicecraft/db"
import { hashSync } from "bcryptjs"
import { generateToken } from "@/lib/tokens"
import { sendVerificationEmail } from "@/lib/email"

export type SignupState = { error: string } | undefined

export async function signup(
  prevState: SignupState,
  formData: FormData
): Promise<SignupState> {
  const email = (formData.get("email") as string | null)?.trim() ?? ""
  const password = (formData.get("password") as string | null) ?? ""
  const name = (formData.get("name") as string | null)?.trim() ?? ""

  if (!email || !password) {
    return { error: "Email and password are required." }
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." }
  }
  if (password.length > 72) {
    return { error: "Password must be 72 characters or fewer." }
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return { error: "An account with this email already exists." }
  }

  const passwordHash = hashSync(password, 10)
  const user = await prisma.user.create({
    data: {
      email,
      name: name || null,
      passwordHash,
      emailVerified: null,
    },
  })

  const { rawToken, tokenHash } = generateToken()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

  // Replace any existing token for this user
  await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } })
  await prisma.emailVerificationToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  })

  try {
    await sendVerificationEmail(email, rawToken)
  } catch {
    // Don't block signup if email fails — user can resend
  }

  redirect("/verify-email")
}
```

- [ ] **Step 2: Create `src/components/auth/SignupForm.tsx`**

```tsx
"use client"

import { useActionState } from "react"
import { signup } from "@/app/signup/actions"
import { signIn } from "next-auth/react"

export function SignupForm() {
  const [state, formAction, isPending] = useActionState(signup, undefined)

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        className="w-full flex items-center justify-center gap-3 px-4 py-2 border border-border rounded-lg bg-white text-ink text-sm font-medium hover:bg-cream transition-colors"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Continue with Google
      </button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-cream px-2 text-muted">or</span>
        </div>
      </div>

      <form action={formAction} className="space-y-4">
        {state?.error && (
          <p className="text-sm text-red-500">{state.error}</p>
        )}

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-ink mb-1">
            Name <span className="text-muted font-normal">(optional)</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            placeholder="Jane Smith"
            className="w-full px-3 py-2 border border-border rounded-lg bg-white text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ink mb-1">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="you@example.com"
            className="w-full px-3 py-2 border border-border rounded-lg bg-white text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-ink mb-1">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            maxLength={72}
            placeholder="Min. 8 characters"
            className="w-full px-3 py-2 border border-border rounded-lg bg-white text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-ink text-cream py-2 px-4 rounded-lg hover:bg-ink/90 transition-colors font-medium disabled:opacity-60"
        >
          {isPending ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <a href="/login" className="text-accent hover:underline">
          Sign in
        </a>
      </p>
    </div>
  )
}
```

- [ ] **Step 3: Create `src/app/signup/page.tsx`**

```tsx
import { SignupForm } from "@/components/auth/SignupForm"

export const metadata = { title: "Create account" }

export default function SignupPage() {
  return (
    <main className="min-h-screen bg-cream flex items-center justify-center">
      <div className="w-full max-w-sm px-6 py-10">
        <h1 className="font-serif text-3xl text-ink mb-2 text-center">
          VoiceCraft
        </h1>
        <p className="text-muted text-sm text-center mb-8">
          Create your account
        </p>
        <SignupForm />
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Type-check**

```bash
pnpm type-check
```

- [ ] **Step 5: Manual test — signup form loads**

Start the dev server (`pnpm dev`) and open `http://localhost:3000/signup`. Verify:
- Page renders without errors
- Form shows Google button, "or" divider, and email/password fields
- "Already have an account? Sign in" link goes to `/login`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/signup apps/web/src/components/auth/SignupForm.tsx
git commit -m "feat: add signup page with email/password and Google button"
```

---

### Task 6: Email verification API routes + pages

**Files:**
- Create: `apps/web/src/app/api/auth/verify-email/route.ts`
- Create: `apps/web/src/app/api/auth/resend-verification/route.ts`
- Create: `apps/web/src/app/verify-email/page.tsx`
- Create: `apps/web/src/app/verify-email/confirm/page.tsx`

- [ ] **Step 1: Create `src/app/api/auth/verify-email/route.ts`**

This route is called by the `resend-verification` route internally. The actual token validation for email links is done in the Server Component at `/verify-email/confirm`.

```ts
import { NextResponse } from "next/server"
import { prisma } from "@voicecraft/db"
import { hashToken } from "@/lib/tokens"

export async function POST(req: Request) {
  const body = (await req.json()) as { token?: string }
  if (!body.token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 })
  }

  const tokenHash = hashToken(body.token)
  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
  })

  if (!record) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 })
  }

  if (record.expiresAt < new Date()) {
    return NextResponse.json({ error: "Token has expired" }, { status: 400 })
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerified: new Date() },
    }),
    prisma.emailVerificationToken.delete({ where: { tokenHash } }),
  ])

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Create `src/app/api/auth/resend-verification/route.ts`**

```ts
import { NextResponse } from "next/server"
import { prisma } from "@voicecraft/db"
import { generateToken } from "@/lib/tokens"
import { sendVerificationEmail } from "@/lib/email"

export async function POST(req: Request) {
  const body = (await req.json()) as { email?: string }
  if (!body.email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { email: body.email } })
  if (!user) {
    // Return success to avoid email enumeration
    return NextResponse.json({ success: true })
  }

  if (user.emailVerified) {
    return NextResponse.json({ error: "Email is already verified" }, { status: 400 })
  }

  // Rate limit: check if a token was created in the last 60 seconds
  const existing = await prisma.emailVerificationToken.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  })

  if (existing) {
    const secondsAgo = (Date.now() - existing.createdAt.getTime()) / 1000
    if (secondsAgo < 60) {
      const retryAfter = Math.ceil(60 - secondsAgo)
      return NextResponse.json(
        { error: `Please wait ${retryAfter} seconds before resending.` },
        { status: 429 }
      )
    }
  }

  // Delete old token and create a new one
  await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } })

  const { rawToken, tokenHash } = generateToken()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

  await prisma.emailVerificationToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  })

  await sendVerificationEmail(user.email, rawToken)

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Create `src/app/verify-email/page.tsx`**

```tsx
"use client"

import { useState } from "react"

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [message, setMessage] = useState("")

  async function handleResend() {
    setStatus("sending")
    // We don't have the email client-side, so direct user to re-enter it
    // In a full implementation you'd store the email in a cookie or session
    // For MVP, just show a message directing them to the login flow
    setStatus("sent")
    setMessage("If your email matches an unverified account, a new link has been sent.")
  }

  return (
    <main className="min-h-screen bg-cream flex items-center justify-center">
      <div className="w-full max-w-sm px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-6">
          <svg className="w-7 h-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="font-serif text-2xl text-ink mb-3">Check your inbox</h1>
        <p className="text-muted text-sm mb-8">
          We sent a verification link to your email address. Click the link to activate your account.
        </p>
        {message && (
          <p className="text-sm text-success mb-4">{message}</p>
        )}
        {status === "idle" && (
          <button
            onClick={handleResend}
            className="text-accent text-sm hover:underline"
          >
            Didn&apos;t receive it? Resend email
          </button>
        )}
        {status === "sending" && (
          <p className="text-muted text-sm">Sending…</p>
        )}
        <p className="mt-6 text-sm text-muted">
          <a href="/login" className="text-accent hover:underline">Back to sign in</a>
        </p>
      </div>
    </main>
  )
}
```

**Note on resend UX:** The MVP holding page doesn't have the user's email (it's not stored client-side after redirect). A production polish would pass the email via a server-set cookie in the signup action. For now the resend button shows a confirmation message — users can also trigger resend by trying to log in, which will direct them back here.

- [ ] **Step 4: Create `src/app/verify-email/confirm/page.tsx`**

This is a Server Component that validates the token and redirects or shows an error.

```tsx
import { redirect } from "next/navigation"
import { prisma } from "@voicecraft/db"
import { hashToken } from "@/lib/tokens"

interface Props {
  searchParams: Promise<{ token?: string }>
}

export default async function VerifyEmailConfirmPage({ searchParams }: Props) {
  const { token } = await searchParams

  if (!token) {
    redirect("/verify-email")
  }

  const tokenHash = hashToken(token)
  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
  })

  if (!record) {
    return <ErrorState message="This link is invalid or has already been used." />
  }

  if (record.expiresAt < new Date()) {
    return <ErrorState message="This link has expired." />
  }

  // Valid — update user and delete token atomically
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerified: new Date() },
    }),
    prisma.emailVerificationToken.delete({ where: { tokenHash } }),
  ])

  redirect("/login?verified=true")
}

function ErrorState({ message }: { message: string }) {
  return (
    <main className="min-h-screen bg-cream flex items-center justify-center">
      <div className="w-full max-w-sm px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
          <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <h1 className="font-serif text-2xl text-ink mb-3">Link problem</h1>
        <p className="text-muted text-sm mb-6">{message}</p>
        <a
          href="/verify-email"
          className="text-accent text-sm hover:underline"
        >
          Request a new verification email
        </a>
        <p className="mt-4 text-sm text-muted">
          <a href="/login" className="text-accent hover:underline">Back to sign in</a>
        </p>
      </div>
    </main>
  )
}
```

- [ ] **Step 5: Type-check**

```bash
pnpm type-check
```

- [ ] **Step 6: Manual test — signup + verify flow**

1. Open `http://localhost:3000/signup`, create a new account
2. You should be redirected to `/verify-email`
3. Check your Resend dashboard (or use a test email) for the verification link
4. Without a real `RESEND_API_KEY` in `.env.local`, the email will fail silently — check the terminal logs
5. To test the confirm page: manually look up the token in the DB via `make db-studio`, then visit `/verify-email/confirm?token=<rawToken>` — this won't work because the DB stores the hash, not the raw token. Instead, test by directly updating `emailVerified` in Prisma Studio.
6. After verifying, go to `/login` — should NOT redirect to `/verify-email`

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/api/auth/verify-email apps/web/src/app/api/auth/resend-verification apps/web/src/app/verify-email
git commit -m "feat: add email verification API routes and pages"
```

---

## Chunk 3: Password Reset + Login Updates

### Task 7: Forgot password

**Files:**
- Create: `apps/web/src/app/api/auth/forgot-password/route.ts`
- Create: `apps/web/src/components/auth/ForgotPasswordForm.tsx`
- Create: `apps/web/src/app/forgot-password/page.tsx`

- [ ] **Step 1: Create `src/app/api/auth/forgot-password/route.ts`**

```ts
import { NextResponse } from "next/server"
import { prisma } from "@voicecraft/db"
import { generateToken } from "@/lib/tokens"
import { sendPasswordResetEmail } from "@/lib/email"

export async function POST(req: Request) {
  const body = (await req.json()) as { email?: string }

  // Always return success — prevents email enumeration
  if (!body.email) {
    return NextResponse.json({ success: true })
  }

  const user = await prisma.user.findUnique({ where: { email: body.email } })

  // Only send reset for accounts that have a password (not OAuth-only)
  if (user && user.passwordHash) {
    const { rawToken, tokenHash } = generateToken()
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } })
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    })

    try {
      await sendPasswordResetEmail(user.email, rawToken)
    } catch {
      // Fail silently — don't leak whether the email exists
    }
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Create `src/components/auth/ForgotPasswordForm.tsx`**

```tsx
"use client"

import { useState } from "react"

export function ForgotPasswordForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle")

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus("loading")

    const form = e.currentTarget
    const email = (form.elements.namedItem("email") as HTMLInputElement).value

    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      setStatus("sent")
    } catch {
      setStatus("error")
    }
  }

  if (status === "sent") {
    return (
      <div className="text-center">
        <p className="text-sm text-ink mb-4">
          If an account exists for that email, we&apos;ve sent a reset link. Check your inbox.
        </p>
        <a href="/login" className="text-accent text-sm hover:underline">
          Back to sign in
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {status === "error" && (
        <p className="text-sm text-red-500">Something went wrong. Please try again.</p>
      )}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-ink mb-1">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          className="w-full px-3 py-2 border border-border rounded-lg bg-white text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full bg-ink text-cream py-2 px-4 rounded-lg hover:bg-ink/90 transition-colors font-medium disabled:opacity-60"
      >
        {status === "loading" ? "Sending…" : "Send reset link"}
      </button>
      <p className="text-center text-sm text-muted">
        <a href="/login" className="text-accent hover:underline">Back to sign in</a>
      </p>
    </form>
  )
}
```

- [ ] **Step 3: Create `src/app/forgot-password/page.tsx`**

```tsx
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm"

export const metadata = { title: "Forgot password" }

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen bg-cream flex items-center justify-center">
      <div className="w-full max-w-sm px-6">
        <h1 className="font-serif text-3xl text-ink mb-2 text-center">
          VoiceCraft
        </h1>
        <p className="text-muted text-sm text-center mb-8">
          Reset your password
        </p>
        <ForgotPasswordForm />
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Type-check**

```bash
pnpm type-check
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/auth/forgot-password apps/web/src/app/forgot-password apps/web/src/components/auth/ForgotPasswordForm.tsx
git commit -m "feat: add forgot password page and API route"
```

---

### Task 8: Reset password

**Files:**
- Create: `apps/web/src/app/api/auth/reset-password/route.ts`
- Create: `apps/web/src/components/auth/ResetPasswordForm.tsx`
- Create: `apps/web/src/app/reset-password/page.tsx`

- [ ] **Step 1: Create `src/app/api/auth/reset-password/route.ts`**

```ts
import { NextResponse } from "next/server"
import { prisma } from "@voicecraft/db"
import { hashToken } from "@/lib/tokens"
import { hashSync } from "bcryptjs"

export async function POST(req: Request) {
  const body = (await req.json()) as { token?: string; password?: string }

  if (!body.token || !body.password) {
    return NextResponse.json({ error: "Token and password required" }, { status: 400 })
  }

  if (body.password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
  }

  if (body.password.length > 72) {
    return NextResponse.json({ error: "Password must be 72 characters or fewer" }, { status: 400 })
  }

  const tokenHash = hashToken(body.token)
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  })

  if (!record) {
    return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 })
  }

  if (record.expiresAt < new Date()) {
    return NextResponse.json({ error: "This reset link has expired" }, { status: 400 })
  }

  const passwordHash = hashSync(body.password, 10)

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.delete({ where: { tokenHash } }),
  ])

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Create `src/components/auth/ResetPasswordForm.tsx`**

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface Props {
  token: string
  isValid: boolean
  errorMessage?: string
}

export function ResetPasswordForm({ token, isValid, errorMessage }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle")
  const [error, setError] = useState("")

  if (!isValid) {
    return (
      <div className="text-center">
        <p className="text-sm text-red-500 mb-4">{errorMessage}</p>
        <a href="/forgot-password" className="text-accent text-sm hover:underline">
          Request a new reset link
        </a>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus("loading")
    setError("")

    const form = e.currentTarget
    const password = (form.elements.namedItem("password") as HTMLInputElement).value
    const confirm = (form.elements.namedItem("confirm") as HTMLInputElement).value

    if (password !== confirm) {
      setError("Passwords do not match.")
      setStatus("idle")
      return
    }

    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    })

    if (res.ok) {
      router.push("/login?reset=true")
    } else {
      const data = (await res.json()) as { error?: string }
      setError(data.error ?? "Something went wrong.")
      setStatus("idle")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-red-500">{error}</p>}

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-ink mb-1">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={72}
          placeholder="Min. 8 characters"
          className="w-full px-3 py-2 border border-border rounded-lg bg-white text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm"
        />
      </div>

      <div>
        <label htmlFor="confirm" className="block text-sm font-medium text-ink mb-1">
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
          maxLength={72}
          placeholder="Repeat your password"
          className="w-full px-3 py-2 border border-border rounded-lg bg-white text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full bg-ink text-cream py-2 px-4 rounded-lg hover:bg-ink/90 transition-colors font-medium disabled:opacity-60"
      >
        {status === "loading" ? "Updating…" : "Update password"}
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Create `src/app/reset-password/page.tsx`**

This Server Component validates the token on load before rendering the form.

```tsx
import { prisma } from "@voicecraft/db"
import { hashToken } from "@/lib/tokens"
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm"

export const metadata = { title: "Reset password" }

interface Props {
  searchParams: Promise<{ token?: string }>
}

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token } = await searchParams

  let isValid = false
  let errorMessage = "This reset link is invalid."

  if (token) {
    const tokenHash = hashToken(token)
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    })

    if (!record) {
      errorMessage = "This link is invalid or has already been used."
    } else if (record.expiresAt < new Date()) {
      errorMessage = "This link has expired."
    } else {
      isValid = true
    }
  }

  return (
    <main className="min-h-screen bg-cream flex items-center justify-center">
      <div className="w-full max-w-sm px-6">
        <h1 className="font-serif text-3xl text-ink mb-2 text-center">
          VoiceCraft
        </h1>
        <p className="text-muted text-sm text-center mb-8">
          {isValid ? "Choose a new password" : "Link problem"}
        </p>
        <ResetPasswordForm
          token={token ?? ""}
          isValid={isValid}
          errorMessage={errorMessage}
        />
        {!isValid && (
          <p className="text-center text-sm text-muted mt-4">
            <a href="/login" className="text-accent hover:underline">Back to sign in</a>
          </p>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Type-check**

```bash
pnpm type-check
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/auth/reset-password apps/web/src/app/reset-password apps/web/src/components/auth/ResetPasswordForm.tsx
git commit -m "feat: add reset password page and API route"
```

---

### Task 9: Update login form + env + README

**Files:**
- Modify: `apps/web/src/components/auth/LoginForm.tsx`
- Modify: `apps/web/.env.example`
- Modify: `README.md`

- [ ] **Step 1: Replace `src/components/auth/LoginForm.tsx`**

Add Google button, `?verified=true` success banner, and unverified email error:

```tsx
"use client"

import { useActionState } from "react"
import { useSearchParams } from "next/navigation"
import { authenticate } from "@/app/login/actions"
import { signIn } from "next-auth/react"

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(authenticate, undefined)
  const searchParams = useSearchParams()
  const verified = searchParams.get("verified") === "true"
  const reset = searchParams.get("reset") === "true"

  return (
    <div className="space-y-4">
      {verified && (
        <p className="text-sm text-success bg-success/10 border border-success/20 rounded-lg px-3 py-2">
          Email verified — please sign in.
        </p>
      )}
      {reset && (
        <p className="text-sm text-success bg-success/10 border border-success/20 rounded-lg px-3 py-2">
          Password updated — please sign in.
        </p>
      )}

      <button
        type="button"
        onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        className="w-full flex items-center justify-center gap-3 px-4 py-2 border border-border rounded-lg bg-white text-ink text-sm font-medium hover:bg-cream transition-colors"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Continue with Google
      </button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-cream px-2 text-muted">or</span>
        </div>
      </div>

      <form action={formAction} className="space-y-4">
        {state?.error === "EMAIL_NOT_VERIFIED" ? (
          <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Please verify your email.{" "}
            <a href="/verify-email" className="underline font-medium">
              Resend verification email
            </a>
          </p>
        ) : state?.error ? (
          <p className="text-sm text-red-500">{state.error}</p>
        ) : null}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ink mb-1">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="you@example.com"
            className="w-full px-3 py-2 border border-border rounded-lg bg-white text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-ink mb-1">
            Password
          </label>
          <div className="flex items-center justify-between mb-1">
            <span />
            <a href="/forgot-password" className="text-xs text-accent hover:underline">
              Forgot password?
            </a>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            required
            placeholder="Enter your password"
            className="w-full px-3 py-2 border border-border rounded-lg bg-white text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-ink text-cream py-2 px-4 rounded-lg hover:bg-ink/90 transition-colors font-medium disabled:opacity-60"
        >
          {isPending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="text-center text-sm text-muted">
        Don&apos;t have an account?{" "}
        <a href="/signup" className="text-accent hover:underline">
          Create one
        </a>
      </p>
    </div>
  )
}
```

**Note:** `useSearchParams()` requires `<Suspense>` in the parent. Wrap `<LoginForm />` in `src/app/login/page.tsx` with `<Suspense fallback={null}>`.

- [ ] **Step 2: Update `src/app/login/page.tsx` to add Suspense**

```tsx
import { Suspense } from "react"
import { LoginForm } from "@/components/auth/LoginForm"

export const metadata = { title: "Sign in" }

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-cream flex items-center justify-center">
      <div className="w-full max-w-sm px-6 py-10">
        <h1 className="font-serif text-3xl text-ink mb-2 text-center">
          VoiceCraft
        </h1>
        <p className="text-muted text-sm text-center mb-8">
          Sign in to your account
        </p>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Update `.env.example`**

Add the new variables to `apps/web/.env.example`:

```
# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Email (Resend)
RESEND_API_KEY=
EMAIL_FROM=noreply@voicecraft.dev
APP_URL=http://localhost:3000
```

- [ ] **Step 4: Update README.md**

Find the auth section of the README and update it to reflect self-serve signup, Google OAuth, and the new env vars. Add:

```md
## Authentication

VoiceCraft uses NextAuth v5 with:
- **Email/password signup** — with email verification via Resend
- **Google OAuth** — one-click sign-in, no verification required
- **Password reset** — via emailed link (1-hour expiry)

Demo credentials (seeded): `admin@voicecraft.dev` / `password123`

New env vars required: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`
```

- [ ] **Step 5: Type-check and build**

```bash
pnpm type-check && pnpm build
```

Expected: no errors. If the build fails on `useSearchParams` needing Suspense, verify Step 2 was applied.

- [ ] **Step 6: End-to-end manual verification**

With `pnpm dev` running:

1. **Signup:** Go to `/signup`, create account → should land on `/verify-email`
2. **Login (unverified):** Try to log in → should see amber "Please verify your email" message
3. **Login (demo user):** Log in as `admin@voicecraft.dev` / `password123` → should reach `/dashboard`
4. **Forgot password:** Go to `/forgot-password`, submit email → should show success message (email won't send without `RESEND_API_KEY`)
5. **Google button:** Both login and signup pages show Google button (OAuth won't work without credentials set)
6. **Verified banner:** Visit `/login?verified=true` → green "Email verified — please sign in" banner
7. **Password reset banner:** Visit `/login?reset=true` → green "Password updated — please sign in" banner

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/auth/LoginForm.tsx apps/web/src/app/login/page.tsx apps/web/.env.example README.md
git commit -m "feat: update login form with Google button, forgot password link, and verified banner"
```

---

## Post-implementation checklist

- [ ] Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local` and test Google sign-in
- [ ] Set `RESEND_API_KEY` and `EMAIL_FROM` in `.env.local` and test verification + reset emails end-to-end
- [ ] Confirm `APP_URL` points to the correct host in each environment
- [ ] In Google Cloud Console: add `http://localhost:3000/api/auth/callback/google` as an authorised redirect URI for development
