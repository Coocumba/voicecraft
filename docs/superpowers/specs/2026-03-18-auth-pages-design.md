# Auth Pages — Design Spec

**Date:** 2026-03-18
**Status:** Approved
**Branch:** main

---

## Overview

VoiceCraft is moving from a seeded-user-only model to self-serve registration. This spec covers all new and updated auth pages, flows, API routes, email delivery, and data model changes required to support:

- Email/password signup with email verification
- Google OAuth signup and login
- Forgot password / password reset via email link

---

## 1. Data Model

### `User` changes

Add one nullable field:

```prisma
emailVerified DateTime?
```

- Null = unverified (email/password signup, not yet confirmed)
- Set to `now()` on email link confirmation or on first Google sign-in (Google guarantees verified emails)

Make `passwordHash` nullable:

```prisma
passwordHash String?
```

Google-only users have no password and must never have a placeholder value in this field. The `authorize` callback must guard against `user.passwordHash === null` and immediately return `null`, preventing any credential sign-in attempt for OAuth-only accounts.

### New: `EmailVerificationToken`

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
```

- Expires 24 hours after creation
- One per user — replaced on resend
- Deleted on successful use
- **Token generation:** `crypto.randomBytes(32).toString('hex')` — raw token sent in email link
- **Storage:** `SHA-256(rawToken)` stored in `tokenHash`, never the raw token
- **Redemption:** incoming token is hashed before the DB lookup; no plaintext comparison needed

### New: `PasswordResetToken`

```prisma
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

- Expires 1 hour after creation
- One per user — replaced on resend
- Deleted on successful use
- Same token generation and hashing as `EmailVerificationToken`

**Security note:** tokens are equivalent to short-lived passwords. Storing only the SHA-256 hash means a database read does not expose valid links. The raw token exists only in the email link and is never persisted.

---

## 2. Pages & Routes

### New Pages

| Route | Purpose |
|---|---|
| `/signup` | Registration form — email/password + "Continue with Google" |
| `/verify-email` | Holding page — "Check your inbox" + resend link |
| `/verify-email/confirm` | Server Component — receives `?token=`, validates, redirects |
| `/forgot-password` | Email input — "Send reset link" |
| `/reset-password` | New password + confirm — receives `?token=` from URL |

### Updated Pages

| Route | Change |
|---|---|
| `/login` | Update `LoginForm.tsx` — add "Continue with Google" button above form with "or" divider |

### New API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/auth/verify-email` | POST | Validate token hash, set `emailVerified`, delete token |
| `/api/auth/resend-verification` | POST | Replace token, resend verification email (rate-limited via DB) |
| `/api/auth/forgot-password` | POST | Look up user, send reset email (always returns success) |
| `/api/auth/reset-password` | POST | Validate token hash, update `passwordHash`, delete token |

---

## 3. Auth Flows

### Signup — Email/Password

Signup uses a **Server Action** (`signup/actions.ts`) — no public-facing API route. This is the idiomatic Next.js App Router pattern and avoids exposing a public endpoint for user creation.

1. User submits signup form → Server Action in `apps/web/src/app/signup/actions.ts`
2. Check email uniqueness → validate password (minimum 8 characters) → hash password with bcryptjs → create `User` (`emailVerified: null`, `passwordHash: hashedValue`)
3. Generate raw token → compute `SHA-256(rawToken)` → store `EmailVerificationToken` with `tokenHash`
4. Send verification email with raw token in link → redirect to `/verify-email`
5. User clicks email link → `/verify-email/confirm?token=rawToken`
6. Server Component hashes incoming token → looks up `EmailVerificationToken` by `tokenHash` → validates expiry
7. Happy path: set `emailVerified = now()`, delete token → redirect to `/login?verified=true`
8. Error path: render a clear error state with a link to request a new verification email (see `/verify-email/confirm` states below)
9. On `/login`, `?verified=true` triggers a success banner: "Email verified — please sign in"

**Why redirect to login instead of auto sign-in:** NextAuth v5's `signIn("credentials", ...)` requires valid credentials through the `authorize` callback and cannot be called server-side with just a user ID. Redirecting to login with a flash parameter avoids a security shortcut and keeps the auth boundary clean.

### Signup / Login — Google OAuth

1. User clicks "Continue with Google" → NextAuth Google provider handles OAuth
2. **First sign-in (new user):** create `User` with `emailVerified = now()`, `passwordHash = null`
3. **First sign-in (existing email/password account):** find user by email → set `emailVerified = now()` if null, leave `passwordHash` intact — user now has both sign-in paths available

**Account linking trust policy:** We trust Google's email verification as equivalent to our own. A user who controls a Google account registered with an email address can sign in to VoiceCraft with that email regardless of whether they created their account with a password. This is an explicit product decision: a compromised Google account means a compromised VoiceCraft account. This tradeoff is acceptable for an MVP targeting SMBs.

4. **Subsequent sign-ins:** find user by email → sign in
5. Redirect to `/dashboard`

### Login — Email/Password (updated)

The `authorize` callback in `src/auth.ts` is updated to:
1. Return `null` immediately if `user.passwordHash === null` (OAuth-only account — cannot use credentials)
2. Return `null` if `user.emailVerified === null` (unverified account — block JWT issuance entirely)
3. Return the user object only if password matches and email is verified

The middleware email gate (Section 5) is defense-in-depth but is **not** the primary enforcement point. The `authorize` callback is the only safe place to prevent JWT issuance for unverified accounts.

On failed login due to unverified email, the `authorize` callback throws a `CredentialsSignin` subclass with a specific code (e.g. `EMAIL_NOT_VERIFIED`). NextAuth appends this as `?error=EMAIL_NOT_VERIFIED` on the login page redirect. `LoginForm.tsx` reads the `error` search param and renders: "Please verify your email. [Resend verification email]"

### Forgot Password

1. User submits email → `POST /api/auth/forgot-password`
2. Always return 200 with success message (prevents email enumeration)
3. If user found and has `passwordHash` (not OAuth-only): generate raw token → compute `SHA-256` → store `PasswordResetToken` → send reset email
4. User clicks link → `/reset-password?token=rawToken`
5. Page validates token on load (server-side): if invalid or expired, show error state with link to `/forgot-password`
6. User submits new password (minimum 8 characters) → `POST /api/auth/reset-password`
7. Hash incoming token → look up `PasswordResetToken` by `tokenHash` → validate expiry
8. Update `passwordHash`, delete token → redirect to `/login` with success message: "Password updated — please sign in"

### Resend Verification

1. User clicks "Resend email" on `/verify-email`
2. `POST /api/auth/resend-verification` — rate-limited via database: check `createdAt` on existing `EmailVerificationToken`; if created less than 60 seconds ago, return 429 with a message showing when they can retry
3. No external rate-limiting infrastructure required (no Redis)
4. Delete old token → generate new raw token → store new `tokenHash` → resend email

### `/verify-email/confirm` States

This page is a Server Component that does all validation during SSR then calls `redirect()` or renders an error:

| State | Behaviour |
|---|---|
| Valid token, not expired | Delete token, set `emailVerified`, redirect to `/login?verified=true` |
| Token not found (invalid or already used) | Render error: "This link is invalid or has already been used." + link to `/verify-email` to request a new one |
| Token expired | Render error: "This link has expired." + link to `/verify-email` to request a new one |
| No token in URL | Redirect to `/verify-email` |

The DB query is done directly in the Server Component (not via an internal API call) to avoid a redundant server-to-server HTTP round-trip.

---

## 4. Email

**Provider:** Resend (`npm install resend`)
**From address:** `noreply@voicecraft.dev` (configurable via `EMAIL_FROM` env var)
**Template engine:** Resend React email renderer

### Env Vars

```
RESEND_API_KEY=
EMAIL_FROM=noreply@voicecraft.dev
APP_URL=https://app.voicecraft.dev        # server-only, not exposed to client bundle
```

`APP_URL` has no `NEXT_PUBLIC_` prefix because it is used only in server-side code (`email.ts` runs only on the server). If any client component ever needs the app URL it should use a separate `NEXT_PUBLIC_APP_URL` variable.

### Email Utility

`src/lib/email.ts` — two exported functions:

```ts
sendVerificationEmail(to: string, rawToken: string): Promise<void>
sendPasswordResetEmail(to: string, rawToken: string): Promise<void>
```

Token URLs constructed from `process.env.APP_URL`.

### Verification Email

- **Subject:** `Verify your VoiceCraft email`
- **Body:** Welcome message + prominent "Verify email" CTA button
- **Link:** `{APP_URL}/verify-email/confirm?token={rawToken}`
- **Footer note:** "This link expires in 24 hours"

### Password Reset Email

- **Subject:** `Reset your VoiceCraft password`
- **Body:** "We received a request to reset your password" + "Reset password" CTA button
- **Link:** `{APP_URL}/reset-password?token={rawToken}`
- **Security note:** "If you didn't request this, you can safely ignore this email. This link expires in 1 hour."

---

## 5. Middleware & Session

### Middleware (`src/middleware.ts`)

Updated logic for `/dashboard/*`:
1. No session → redirect to `/login`
2. Session exists but `emailVerified` is null → redirect to `/verify-email` (defense-in-depth; primary gate is in `authorize`)
3. Session exists and verified → allow through

Public routes (always accessible): `/login`, `/signup`, `/verify-email`, `/verify-email/confirm`, `/forgot-password`, `/reset-password`, `/api/auth/*`

### JWT / Session (`src/auth.ts`)

- Add `emailVerified` to JWT token and session object — avoids DB query in middleware
- Extend NextAuth TypeScript types: `session.user.emailVerified: Date | null`
- `authorize` callback updated: returns `null` for unverified emails and null `passwordHash` (see Section 3)

### Google Provider

- Import `Google` from `next-auth/providers/google`
- New env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `signIn` callback: find-or-create user by email; set `emailVerified = now()` and `passwordHash = null` on creation; update `emailVerified` if null for existing users

### Data Migration for Existing Seeded Users

The migration that adds `emailVerified DateTime?` must include a data migration step that sets `emailVerified = NOW()` for all pre-existing users. Without this, `admin@voicecraft.dev` (the seeded demo user) will have `emailVerified = null` and be blocked by the middleware gate immediately after deploying.

The migration SQL backfill:

```sql
UPDATE "User" SET "emailVerified" = NOW() WHERE "emailVerified" IS NULL;
```

The `seed.ts` script must also be updated to set `emailVerified: new Date()` when creating the demo user.

---

## 6. Password Validation

Enforced at both API route and client-side form level:

- Minimum 8 characters
- No maximum (bcrypt has a 72-byte input limit; the API route must truncate or reject inputs over 72 characters to avoid silent bcrypt truncation)

---

## 7. Environment Variables Summary

```
# Existing
DATABASE_URL=
AUTH_SECRET=

# New
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
RESEND_API_KEY=
EMAIL_FROM=noreply@voicecraft.dev
APP_URL=https://app.voicecraft.dev
```

---

## 8. File Changelist

| File | Change |
|---|---|
| `packages/db/prisma/schema.prisma` | Add `emailVerified` and make `passwordHash` nullable on User; add `EmailVerificationToken`, `PasswordResetToken` models with `@@index([userId])` |
| `packages/db/prisma/migrations/*/migration.sql` | Auto-generated migration + backfill: `UPDATE "User" SET "emailVerified" = NOW() WHERE "emailVerified" IS NULL` |
| `packages/db/prisma/seed.ts` | Set `emailVerified: new Date()` for seeded demo user |
| `apps/web/src/auth.ts` | Add Google provider; extend JWT/session with `emailVerified`; update `authorize` to reject null `passwordHash` and unverified emails; add `signIn` callback for find-or-create |
| `apps/web/src/middleware.ts` | Add email verification gate as defense-in-depth |
| `apps/web/src/lib/email.ts` | New — Resend client + `sendVerificationEmail` + `sendPasswordResetEmail` |
| `apps/web/src/components/auth/LoginForm.tsx` | Add Google sign-in button + "or" divider; handle `?verified=true` success banner |
| `apps/web/src/app/signup/page.tsx` | New page |
| `apps/web/src/app/signup/actions.ts` | New Server Action — user creation, token generation, email send |
| `apps/web/src/components/auth/SignupForm.tsx` | New form component |
| `apps/web/src/app/verify-email/page.tsx` | New holding page |
| `apps/web/src/app/verify-email/confirm/page.tsx` | New Server Component — validates token, handles all states, redirects or renders error |
| `apps/web/src/app/forgot-password/page.tsx` | New page |
| `apps/web/src/components/auth/ForgotPasswordForm.tsx` | New client form component — email input, submit, success state |
| `apps/web/src/app/reset-password/page.tsx` | New page — validates token on load, shows error if invalid/expired |
| `apps/web/src/components/auth/ResetPasswordForm.tsx` | New form component |
| `apps/web/src/app/api/auth/verify-email/route.ts` | New API route |
| `apps/web/src/app/api/auth/resend-verification/route.ts` | New API route |
| `apps/web/src/app/api/auth/forgot-password/route.ts` | New API route |
| `apps/web/src/app/api/auth/reset-password/route.ts` | New API route |
| `apps/web/.env.example` | Add new env vars |
| `README.md` | Update auth section |
