import { prisma } from "@voicecraft/db"
import { validateTwilioSignature } from "@/lib/twilio"

/**
 * POST /api/webhooks/twilio-voice
 *
 * Single webhook that Twilio calls for ALL inbound voice calls across all
 * provisioned numbers. Looks up the agent by the called number and returns
 * TwiML that dials the call through to LiveKit's SIP endpoint.
 *
 * Twilio POSTs form-encoded data including:
 *   - To:   the Twilio number that was called (E.164)
 *   - From: the caller's number (E.164)
 *
 * We return TwiML with <Dial><Sip> pointing at the LiveKit SIP domain,
 * authenticated with platform-level SIP credentials.
 */
export async function POST(request: Request) {
  // Validate Twilio signature to prevent forged requests
  const signature = request.headers.get("X-Twilio-Signature") ?? ""
  const formData = await request.formData()

  const params: Record<string, string> = {}
  formData.forEach((value, key) => {
    params[key] = String(value)
  })

  // Use the public URL for signature validation — behind a reverse proxy/Docker,
  // request.url resolves to the internal address (e.g. 0.0.0.0:8080) which won't
  // match the URL Twilio signed against.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const url = appUrl
    ? `${appUrl}/api/webhooks/twilio-voice`
    : request.url
  if (!validateTwilioSignature(url, params, signature)) {
    console.warn("[twilio-voice] Invalid Twilio signature", { url })
    return new Response("Forbidden", { status: 403 })
  }

  const to = params["To"] ?? null
  const from = params["From"] ?? null

  if (!to) {
    return new Response(twimlReject("No destination number"), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    })
  }

  // Look up which agent owns this phone number
  const agent = await prisma.agent.findFirst({
    where: { phoneNumber: to, status: "ACTIVE" },
    select: { id: true, phoneNumber: true },
  })

  if (!agent) {
    console.warn("[twilio-voice] No active agent for number", { to, from })
    return new Response(twimlReject("This number is not currently active"), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    })
  }

  // Build the SIP URI for LiveKit
  const livekitUrl = process.env.LIVEKIT_URL
  const sipUsername = process.env.LIVEKIT_SIP_USERNAME
  const sipPassword = process.env.LIVEKIT_SIP_PASSWORD

  if (!livekitUrl || !sipUsername || !sipPassword) {
    console.error("[twilio-voice] LiveKit SIP env vars not configured")
    return new Response(twimlReject("Service temporarily unavailable"), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    })
  }

  // Derive SIP domain: wss://projectid.livekit.cloud → projectid.sip.livekit.cloud
  const sipDomain = new URL(livekitUrl).hostname.replace(/^([^.]+)\./, "$1.sip.")

  const twiml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Response>",
    "<Dial>",
    `<Sip username="${escapeXml(sipUsername)}" password="${escapeXml(sipPassword)}">`,
    `sip:${escapeXml(to)}@${escapeXml(sipDomain)};transport=tcp`,
    "</Sip>",
    "</Dial>",
    "</Response>",
  ].join("")

  console.info("[twilio-voice] Routing call", { to, from, agentId: agent.id })

  return new Response(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  })
}

function twimlReject(reason: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Response>",
    `<Say>${escapeXml(reason)}</Say>`,
    "<Hangup/>",
    "</Response>",
  ].join("")
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}
