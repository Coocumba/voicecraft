// Handle the Google OAuth 2.0 callback.
// GET /api/integrations/google/callback?code=...&state=...
//
// Verifies the state token, exchanges the authorization code for tokens,
// upserts the Integration record, and redirects to /dashboard/settings.

import { auth } from "@/auth"
import { prisma, IntegrationProvider } from "@voicecraft/db"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

const GOOGLE_OAUTH_STATE_COOKIE = "google_oauth_state"

interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  scope: string
}

interface GoogleUserInfo {
  email?: string
  name?: string
}

export async function GET(request: Request): Promise<Response> {
  const session = await auth()
  const userId = session?.user?.id
  if (!session?.user || !userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  // Handle user-denied consent or other OAuth errors.
  if (error) {
    console.warn("[Google OAuth] Provider returned error", { error, userId: userId })
    redirect("/dashboard/settings?integration=error&provider=google")
  }

  if (!code || !state) {
    redirect("/dashboard/settings?integration=error&provider=google")
  }

  // Verify the state token matches what we set in the cookie.
  const cookieStore = await cookies()
  const storedState = cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE)?.value

  if (!storedState || storedState !== state) {
    console.error("[Google OAuth] State mismatch — possible CSRF", {
      userId: userId,
    })
    redirect("/dashboard/settings?integration=error&provider=google")
  }

  // Clear the state cookie immediately — single use.
  cookieStore.delete(GOOGLE_OAUTH_STATE_COOKIE)

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (!clientId || !clientSecret || !appUrl) {
    console.error("[Google OAuth] Missing environment variables")
    redirect("/dashboard/settings?integration=error&provider=google")
  }

  // Exchange the authorization code for access + refresh tokens.
  let tokenData: GoogleTokenResponse
  try {
    const tokenParams = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${appUrl}/api/integrations/google/callback`,
      grant_type: "authorization_code",
    })

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString(),
    })

    if (!tokenRes.ok) {
      const text = await tokenRes.text()
      console.error("[Google OAuth] Token exchange failed", {
        status: tokenRes.status,
        body: text,
        userId: userId,
      })
      redirect("/dashboard/settings?integration=error&provider=google")
    }

    tokenData = (await tokenRes.json()) as GoogleTokenResponse
  } catch (err) {
    console.error("[Google OAuth] Token exchange threw", { err, userId: userId })
    redirect("/dashboard/settings?integration=error&provider=google")
  }

  // Optionally fetch the connected account's email for metadata storage.
  let accountEmail: string | undefined
  try {
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    if (userInfoRes.ok) {
      const info = (await userInfoRes.json()) as GoogleUserInfo
      accountEmail = info.email
    }
  } catch {
    // Non-fatal — metadata is informational only.
  }

  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000)

  try {
    await prisma.integration.upsert({
      where: {
        userId_provider: {
          userId,
          provider: IntegrationProvider.GOOGLE_CALENDAR,
        },
      },
      create: {
        userId,
        provider: IntegrationProvider.GOOGLE_CALENDAR,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? null,
        expiresAt,
        metadata: accountEmail ? { accountEmail } : undefined,
      },
      update: {
        accessToken: tokenData.access_token,
        // Only overwrite the refresh token if Google issued a new one.
        ...(tokenData.refresh_token ? { refreshToken: tokenData.refresh_token } : {}),
        expiresAt,
        metadata: accountEmail ? { accountEmail } : undefined,
      },
    })
  } catch (err) {
    console.error("[Google OAuth] Failed to persist integration", { err, userId })
    redirect("/dashboard/settings?integration=error&provider=google")
  }

  redirect("/dashboard/settings?integration=success&provider=google")
}
