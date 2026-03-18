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

### New: `EmailVerificationToken`

```prisma
model EmailVerificationToken {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

- Expires 24 hours after creation
- One per user — replaced on resend
- Deleted on successful use
- Token: 32-byte random hex string via `crypto.randomBytes(32).toString('hex')`

### New: `PasswordResetToken`

```prisma
model PasswordResetToken {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

- Expires 1 hour after creation
- One per user — replaced on resend
- Deleted on successful use
- Same token generation as above

---

## 2. Pages & Routes

### New Pages

| Route | Purpose |
|---|---|
| `/signup` | Registration form — email/password + "Continue with Google" |
| `/verify-email` | Holding page — "Check your inbox" + resend link |
| `/verify-email/confirm` | No UI — receives `?token=`, validates, redirects |
| `/forgot-password` | Email input — "Send reset link" |
| `/reset-password` | New password + confirm — receives `?token=` from URL |

### Updated Pages

| Route | Change |
|---|---|
| `/login` | Add "Continue with Google" button above form with "or" divider |

### New API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/auth/signup` | POST | Create user, hash password, send verification email |
| `/api/auth/verify-email` | POST | Validate token, set `emailVerified`, delete token |
| `/api/auth/resend-verification` | POST | Replace token, resend verification email (rate-limited: 1/min) |
| `/api/auth/forgot-password` | POST | Look up user, send reset email (always returns success) |
| `/api/auth/reset-password` | POST | Validate token, update `passwordHash`, delete token |

---

## 3. Auth Flows

### Signup — Email/Password

1. User submits signup form → `POST /api/auth/signup`
2. Check email uniqueness → hash password → create `User` (`emailVerified: null`)
3. Generate `EmailVerificationToken` → send verification email
4. Redirect to `/verify-email`
5. User clicks email link → `/verify-email/confirm?token=xxx`
6. Token validated and not expired → set `emailVerified = now()`, delete token → auto sign-in → redirect to `/dashboard`

### Signup / Login — Google OAuth

1. User clicks "Continue with Google" → NextAuth Google provider handles OAuth
2. **First sign-in:** look up user by email — if not found, create `User` with `emailVerified = now()`; if found (prior email/password account), link by setting `emailVerified = now()` if not already set
3. **Subsequent sign-ins:** find user by email → sign in
4. Redirect to `/dashboard`

### Login — Email/Password (existing flow, updated)

1. Credentials validated as before
2. If `emailVerified` is null → redirect to `/verify-email` with a message to check their inbox
3. If verified → sign in and redirect to `/dashboard`

### Forgot Password

1. User submits email on `/forgot-password` → `POST /api/auth/forgot-password`
2. Always return success (prevents email enumeration)
3. If user found: generate `PasswordResetToken` → send reset email
4. User clicks link → `/reset-password?token=xxx`
5. User submits new password → `POST /api/auth/reset-password`
6. Token validated and not expired → update `passwordHash`, delete token → redirect to `/login` with success message

### Resend Verification

1. User clicks "Resend email" on `/verify-email`
2. `POST /api/auth/resend-verification` — rate-limited to 1 request per minute per user
3. Delete old token → generate new `EmailVerificationToken` → resend email

---

## 4. Email

**Provider:** Resend (`npm install resend`)
**From address:** `noreply@voicecraft.dev` (configurable via `EMAIL_FROM` env var)
**Template engine:** Resend React email renderer

### New env vars

```
RESEND_API_KEY=
EMAIL_FROM=noreply@voicecraft.dev
NEXT_PUBLIC_APP_URL=https://app.voicecraft.dev
```

### Email utility

`src/lib/email.ts` — two exported functions:

```ts
sendVerificationEmail(to: string, token: string): Promise<void>
sendPasswordResetEmail(to: string, token: string): Promise<void>
```

Token URLs constructed from `NEXT_PUBLIC_APP_URL`.

### Verification Email

- **Subject:** `Verify your VoiceCraft email`
- **Body:** Welcome message + prominent "Verify email" CTA button
- **Link:** `{APP_URL}/verify-email/confirm?token={token}`
- **Footer note:** "This link expires in 24 hours"

### Password Reset Email

- **Subject:** `Reset your VoiceCraft password`
- **Body:** "We received a request to reset your password" + "Reset password" CTA button
- **Link:** `{APP_URL}/reset-password?token={token}`
- **Security note:** "If you didn't request this, you can safely ignore this email. This link expires in 1 hour."

---

## 5. Middleware & Session

### Middleware (`src/middleware.ts`)

Updated logic for `/dashboard/*`:
1. No session → redirect to `/login`
2. Session exists but `emailVerified` is null → redirect to `/verify-email`
3. Session exists and verified → allow through

Public routes (always accessible): `/login`, `/signup`, `/verify-email`, `/verify-email/confirm`, `/forgot-password`, `/reset-password`, `/api/auth/*`

### JWT / Session (`src/auth.ts`)

- Add `emailVerified` to JWT token and session object — avoids DB query in middleware
- Extend NextAuth TypeScript types: `session.user.emailVerified: Date | null`

### Google Provider

- Import `Google` from `next-auth/providers/google`
- New env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `signIn` callback: find-or-create user by email; set `emailVerified = now()` on creation or if previously null

---

## 6. Environment Variables Summary

```
# Existing
DATABASE_URL=
AUTH_SECRET=

# New
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
RESEND_API_KEY=
EMAIL_FROM=noreply@voicecraft.dev
NEXT_PUBLIC_APP_URL=https://app.voicecraft.dev
```

---

## 7. File Changelist

| File | Change |
|---|---|
| `packages/db/prisma/schema.prisma` | Add `emailVerified` to User; add `EmailVerificationToken`, `PasswordResetToken` models |
| `packages/db/prisma/migrations/*/migration.sql` | Auto-generated migration |
| `apps/web/src/auth.ts` | Add Google provider; extend JWT/session with `emailVerified`; add `signIn` callback |
| `apps/web/src/middleware.ts` | Add email verification gate |
| `apps/web/src/lib/email.ts` | New — Resend client + `sendVerificationEmail` + `sendPasswordResetEmail` |
| `apps/web/src/app/login/page.tsx` | Add Google button + "or" divider |
| `apps/web/src/components/auth/LoginForm.tsx` | Add Google sign-in button |
| `apps/web/src/app/signup/page.tsx` | New page |
| `apps/web/src/app/signup/actions.ts` | New server action |
| `apps/web/src/components/auth/SignupForm.tsx` | New form component |
| `apps/web/src/app/verify-email/page.tsx` | New holding page |
| `apps/web/src/app/verify-email/confirm/page.tsx` | New token-confirmation page |
| `apps/web/src/app/forgot-password/page.tsx` | New page |
| `apps/web/src/components/auth/ForgotPasswordForm.tsx` | New form component |
| `apps/web/src/app/reset-password/page.tsx` | New page |
| `apps/web/src/components/auth/ResetPasswordForm.tsx` | New form component |
| `apps/web/src/app/api/auth/signup/route.ts` | New API route |
| `apps/web/src/app/api/auth/verify-email/route.ts` | New API route |
| `apps/web/src/app/api/auth/resend-verification/route.ts` | New API route |
| `apps/web/src/app/api/auth/forgot-password/route.ts` | New API route |
| `apps/web/src/app/api/auth/reset-password/route.ts` | New API route |
| `apps/web/.env.example` | Add new env vars |
| `README.md` | Update auth section |
