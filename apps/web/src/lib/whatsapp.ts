// WhatsApp utilities — thin wrappers over the Twilio Messages REST API.
// All numbers must be in E.164 format (e.g. +16505551234).
//
// Required env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
// Template env vars: TWILIO_WA_CONFIRMATION_SID, TWILIO_WA_REMINDER_SID

function twilioBasicAuth(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) {
    throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN env vars are required")
  }
  return `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`
}

function twilioBaseUrl(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID
  if (!sid) throw new Error("TWILIO_ACCOUNT_SID env var is required")
  return `https://api.twilio.com/2010-04-01/Accounts/${sid}`
}

interface TwilioMessageResponse {
  sid: string
  status: string
  error_code?: number
  error_message?: string
}

/**
 * Send a free-form WhatsApp message (valid within a 24h session window).
 *
 * @param to   Recipient in E.164 format
 * @param body Message text
 * @param from Sender in E.164 format (the agent's provisioned number)
 */
export async function sendWhatsApp(
  to: string,
  body: string,
  from: string
): Promise<{ success: boolean; sid?: string }> {
  const params = new URLSearchParams({
    To: `whatsapp:${to}`,
    From: `whatsapp:${from}`,
    Body: body,
  })

  const res = await fetch(`${twilioBaseUrl()}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: twilioBasicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  })

  const data = (await res.json()) as TwilioMessageResponse

  if (!res.ok) {
    const code = data.error_code ?? res.status
    const message = data.error_message ?? "Unknown Twilio error"
    throw new Error(`WhatsApp message failed [${code}]: ${message}`)
  }

  return { success: true, sid: data.sid }
}

/**
 * Send a Meta-approved template message (works outside the 24h session window).
 * Template variables are passed as an ordered array matching {{1}}, {{2}}, etc.
 *
 * Error 63016 means the recipient's number is not registered on WhatsApp.
 * Callers must handle this gracefully (log and continue — do not rethrow).
 *
 * @param to          Recipient in E.164 format
 * @param from        Sender in E.164 format (the agent's provisioned number)
 * @param contentSid  Twilio Content Template SID (e.g. HX...)
 * @param variables   Ordered array of variable values: ["Sarah", "Cleaning", ...]
 */
export async function sendWhatsAppTemplate(
  to: string,
  from: string,
  contentSid: string,
  variables: string[]
): Promise<{ success: boolean; sid?: string }> {
  // ContentVariables must be JSON: {"1": "val1", "2": "val2", ...}
  const contentVariables = JSON.stringify(
    Object.fromEntries(variables.map((v, i) => [String(i + 1), v]))
  )

  const params = new URLSearchParams({
    To: `whatsapp:${to}`,
    From: `whatsapp:${from}`,
    ContentSid: contentSid,
    ContentVariables: contentVariables,
  })

  const res = await fetch(`${twilioBaseUrl()}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: twilioBasicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  })

  const data = (await res.json()) as TwilioMessageResponse

  if (!res.ok) {
    const code = data.error_code ?? res.status
    const message = data.error_message ?? "Unknown Twilio error"
    throw new Error(`WhatsApp template failed [${code}]: ${message}`)
  }

  return { success: true, sid: data.sid }
}
