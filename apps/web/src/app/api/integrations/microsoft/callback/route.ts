// Handle the Microsoft OAuth 2.0 callback.
// GET /api/integrations/microsoft/callback?code=...&state=...
//
// Verifies the state token, exchanges the authorization code for tokens,
// enforces one-at-a-time calendar integration (deletes any existing Google/Microsoft),
// creates the Integration record, and redirects to /settings.

import { auth } from "@/auth"
import { prisma, IntegrationProvider } from "@voicecraft/db"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

const MICROSOFT_OAUTH_STATE_COOKIE = "microsoft_oauth_state"

interface MicrosoftTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  scope: string
}

interface MicrosoftUserInfo {
  mail?: string | null
  userPrincipalName?: string
  displayName?: string | null
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
    console.warn("[Microsoft OAuth] Provider returned error", { error, userId: userId })
    redirect("/settings?integration=error&provider=microsoft")
  }

  if (!code || !state) {
    redirect("/settings?integration=error&provider=microsoft")
  }

  // Verify the state token matches what we set in the cookie.
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(MICROSOFT_OAUTH_STATE_COOKIE)?.value
  let storedCsrf: string | undefined
  let returnTo: string | null = null
  try {
    const parsed = JSON.parse(cookieValue ?? "") as { csrf?: unknown; returnTo?: unknown }
    storedCsrf = typeof parsed.csrf === "string" ? parsed.csrf : undefined
    returnTo =
      typeof parsed.returnTo === "string" && parsed.returnTo.startsWith("/")
        ? parsed.returnTo
        : null
  } catch {
    storedCsrf = cookieValue // backward compat: plain hex string
  }

  if (!storedCsrf || storedCsrf !== state) {
    console.error("[Microsoft OAuth] State mismatch — possible CSRF", {
      userId: userId,
    })
    redirect("/settings?integration=error&provider=microsoft")
  }

  // Clear the state cookie immediately — single use.
  cookieStore.delete(MICROSOFT_OAUTH_STATE_COOKIE)

  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (!clientId || !clientSecret || !appUrl) {
    console.error("[Microsoft OAuth] Missing environment variables")
    redirect("/settings?integration=error&provider=microsoft")
  }

  // Exchange the authorization code for access + refresh tokens.
  let tokenData: MicrosoftTokenResponse
  try {
    const tokenParams = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${appUrl}/api/integrations/microsoft/callback`,
      grant_type: "authorization_code",
      scope: "Calendars.ReadWrite User.Read offline_access",
    })

    const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString(),
    })

    if (!tokenRes.ok) {
      const text = await tokenRes.text()
      console.error("[Microsoft OAuth] Token exchange failed", {
        status: tokenRes.status,
        body: text,
        userId: userId,
      })
      redirect("/settings?integration=error&provider=microsoft")
    }

    tokenData = (await tokenRes.json()) as MicrosoftTokenResponse
  } catch (err) {
    console.error("[Microsoft OAuth] Token exchange threw", { err, userId: userId })
    redirect("/settings?integration=error&provider=microsoft")
  }

  // Fetch the connected account's email for metadata storage.
  let accountEmail: string | undefined
  try {
    const userInfoRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    if (userInfoRes.ok) {
      const info = (await userInfoRes.json()) as MicrosoftUserInfo
      accountEmail = info.mail ?? info.userPrincipalName
    }
  } catch {
    // Non-fatal — metadata is informational only.
  }

  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000)

  try {
    // Delete any existing calendar integration before creating new one (one-at-a-time enforcement)
    await prisma.integration.deleteMany({
      where: {
        userId,
        provider: { in: [IntegrationProvider.GOOGLE_CALENDAR, IntegrationProvider.MICROSOFT_OUTLOOK] },
      },
    })

    // Create the new integration
    await prisma.integration.create({
      data: {
        userId,
        provider: IntegrationProvider.MICROSOFT_OUTLOOK,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? null,
        expiresAt,
        metadata: accountEmail ? { accountEmail } : undefined,
      },
    })
  } catch (err) {
    console.error("[Microsoft OAuth] Failed to persist integration", { err, userId })
    redirect("/settings?integration=error&provider=microsoft")
  }

  const redirectUrl = returnTo
    ? `${returnTo}${returnTo.includes("?") ? "&" : "?"}integration=success`
    : "/settings?integration=success&provider=microsoft"
  redirect(redirectUrl)
}
