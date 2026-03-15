// Twilio REST API utilities.
// Uses plain fetch against the Twilio API — no SDK needed.
// Required env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface TwilioMessageResponse {
  sid: string
  status: string
  error_code?: number
  error_message?: string
}

interface TwilioAvailableNumber {
  phone_number: string
  sid?: string
}

interface TwilioAvailableNumbersResponse {
  available_phone_numbers?: TwilioAvailableNumber[]
}

interface TwilioPurchasedNumberResponse {
  sid: string
  phone_number: string
}

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

/**
 * Returns true if all three Twilio env vars are configured.
 * Used by callers to decide whether to attempt a real send vs. mock.
 */
export function isTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  )
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send an SMS via Twilio's Messages REST API.
 *
 * @param to   Destination phone number in E.164 format (e.g. +15551234567).
 * @param body SMS message body.  Must not contain PII in logs.
 */
export async function sendSms(
  to: string,
  body: string
): Promise<{ success: boolean; sid?: string }> {
  const from = process.env.TWILIO_FROM_NUMBER
  if (!from) throw new Error("TWILIO_FROM_NUMBER env var is required")

  const params = new URLSearchParams({
    To: to,
    From: from,
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
    // Twilio error codes are documented at https://www.twilio.com/docs/api/errors
    const code = data.error_code ?? res.status
    const message = data.error_message ?? "Unknown Twilio error"
    throw new Error(`Twilio SMS failed [${code}]: ${message}`)
  }

  return { success: true, sid: data.sid }
}

/**
 * Purchase an available US phone number, optionally filtered by area code.
 * The number is activated immediately on the account.
 */
export async function purchasePhoneNumber(
  areaCode?: string
): Promise<{ phoneNumber: string; sid: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  if (!sid) throw new Error("TWILIO_ACCOUNT_SID env var is required")

  // Step 1: Find an available number.
  const searchParams = new URLSearchParams({ Limit: "1" })
  if (areaCode) searchParams.set("AreaCode", areaCode)

  const searchUrl = `${twilioBaseUrl()}/AvailablePhoneNumbers/US/Local.json?${searchParams.toString()}`
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: twilioBasicAuth() },
  })

  if (!searchRes.ok) {
    const text = await searchRes.text()
    throw new Error(`Twilio number search failed (${searchRes.status}): ${text}`)
  }

  const searchData = (await searchRes.json()) as TwilioAvailableNumbersResponse
  const available = searchData.available_phone_numbers ?? []

  if (available.length === 0 || !available[0]) {
    throw new Error(
      areaCode
        ? `No available Twilio numbers for area code ${areaCode}`
        : "No available Twilio numbers"
    )
  }

  const numberToPurchase = available[0].phone_number

  // Step 2: Purchase the number.
  const purchaseParams = new URLSearchParams({ PhoneNumber: numberToPurchase })

  const purchaseRes = await fetch(`${twilioBaseUrl()}/IncomingPhoneNumbers.json`, {
    method: "POST",
    headers: {
      Authorization: twilioBasicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: purchaseParams.toString(),
  })

  if (!purchaseRes.ok) {
    const text = await purchaseRes.text()
    throw new Error(`Twilio number purchase failed (${purchaseRes.status}): ${text}`)
  }

  const purchased = (await purchaseRes.json()) as TwilioPurchasedNumberResponse
  return { phoneNumber: purchased.phone_number, sid: purchased.sid }
}
