// Initiate the Microsoft OAuth 2.0 flow for Outlook Calendar access.
// GET /api/integrations/microsoft
//
// Generates a cryptographically random state token, stores it in an httpOnly
// cookie, and redirects the browser to Microsoft's authorization endpoint.

import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { randomBytes } from "crypto"

const MICROSOFT_OAUTH_STATE_COOKIE = "microsoft_oauth_state"

const SCOPES = [
  "Calendars.ReadWrite",
  "User.Read",
  "offline_access",
].join(" ")

export async function GET(request: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (!clientId || !clientSecret || !appUrl) {
    return Response.json(
      { error: "Microsoft Outlook integration is not configured on this server" },
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
  cookieStore.set(MICROSOFT_OAUTH_STATE_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // Expire after 10 minutes — enough time for the user to complete the OAuth flow.
    maxAge: 60 * 10,
    path: "/",
  })

  const redirectUri = `${appUrl}/api/integrations/microsoft/callback`

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    // Force re-consent so we always receive a refresh token.
    prompt: "consent",
    state,
  })

  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`

  redirect(authUrl)
}
