// Initiate the Google OAuth 2.0 flow for Google Calendar access.
// GET /api/integrations/google
//
// Generates a cryptographically random state token, stores it in an httpOnly
// cookie, and redirects the browser to Google's authorization endpoint.

import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { randomBytes } from "crypto"

const GOOGLE_OAUTH_STATE_COOKIE = "google_oauth_state"

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ")

export async function GET(request: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (!clientId || !appUrl) {
    return Response.json(
      { error: "Google Calendar integration is not configured on this server" },
      { status: 503 }
    )
  }

  const { searchParams } = new URL(request.url)
  const returnToParam = searchParams.get("returnTo")
  const returnTo = returnToParam?.startsWith("/dashboard/") ? returnToParam : null

  // Generate a 32-byte random state token to prevent CSRF.
  const state = randomBytes(32).toString("hex")

  const cookieStore = await cookies()
  const cookieValue = JSON.stringify({ csrf: state, returnTo })
  cookieStore.set(GOOGLE_OAUTH_STATE_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // Expire after 10 minutes — enough time for the user to complete the OAuth flow.
    maxAge: 60 * 10,
    path: "/",
  })

  const redirectUri = `${appUrl}/api/integrations/google/callback`

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    // Force re-consent so we always receive a refresh token.
    prompt: "consent",
    state,
  })

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

  redirect(authUrl)
}
