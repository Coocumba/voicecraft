// Webhook called by the LiveKit voice agent to send an SMS to a patient.
// Authentication is via VOICECRAFT_API_KEY header — no user session.
//
// Sends a real SMS via Twilio if the three required env vars are present;
// falls back to a mock (logged only) when they are not configured.

import { sendSms, isTwilioConfigured } from "@/lib/twilio"
import { withCors, preflightResponse } from "@/lib/cors"

export function OPTIONS(): Response {
  return preflightResponse()
}

export async function POST(request: Request): Promise<Response> {
  const corsHeaders = withCors()

  const apiKey = request.headers.get("x-api-key")
  if (apiKey !== process.env.VOICECRAFT_API_KEY) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: corsHeaders })
  }

  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Request body must be an object" }, { status: 400, headers: corsHeaders })
  }

  const { to, message } = body as Record<string, unknown>

  if (typeof to !== "string" || to.trim() === "") {
    return Response.json({ error: "to is required (phone number)" }, { status: 400, headers: corsHeaders })
  }
  if (typeof message !== "string" || message.trim() === "") {
    return Response.json({ error: "message is required" }, { status: 400, headers: corsHeaders })
  }

  // Basic E.164-ish validation — must start with + and contain only digits after that.
  const phoneRegex = /^\+[1-9]\d{6,14}$/
  if (!phoneRegex.test(to.trim())) {
    return Response.json(
      { error: "to must be a valid E.164 phone number (e.g. +15551234567)" },
      { status: 400, headers: corsHeaders }
    )
  }

  const recipient = to.trim()

  if (isTwilioConfigured()) {
    try {
      const result = await sendSms(recipient, message.trim())
      return Response.json({
        success: result.success,
        to: recipient,
        sid: result.sid,
      }, { headers: corsHeaders })
    } catch (err) {
      // Twilio errors can be transient (rate limits, carrier issues) or permanent
      // (invalid number, account suspended).  Log and surface the failure so the
      // caller can decide whether to retry.
      console.error("[POST /api/webhooks/send-sms] Twilio send failed", { err, to: recipient })
      return Response.json(
        { error: "SMS delivery failed", details: err instanceof Error ? err.message : "Unknown error" },
        { status: 502, headers: corsHeaders }
      )
    }
  }

  // Fallback: mock — log only, never echo the message body (may contain PII).
  console.info("[SMS mock] to=%s (Twilio not configured)", recipient)

  return Response.json({
    success: true,
    to: recipient,
    mock: true,
  }, { headers: corsHeaders })
}
