// Twilio REST API utilities.
// Uses plain fetch against the Twilio API — no SDK needed.
// Required env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER

import crypto from "crypto"

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
  friendly_name?: string
  locality?: string
  region?: string
  postal_code?: string
}

interface TwilioAvailableNumbersResponse {
  available_phone_numbers?: TwilioAvailableNumber[]
}

// ---------------------------------------------------------------------------
// Public types for number search
// ---------------------------------------------------------------------------

export interface TwilioSearchParams {
  areaCode?: string
  contains?: string     // Vanity pattern — will be wrapped with * wildcards
  locality?: string     // City name
  region?: string       // 2-letter state code
  limit?: number        // 1-30, default 20
}

export interface AvailableNumber {
  phoneNumber: string       // E.164
  friendlyName: string      // Twilio display name
  locality: string | null
  region: string | null
  postalCode: string | null
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
 * Used by callers to decide whether to attempt a real SMS send vs. mock.
 */
export function isTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  )
}

/**
 * Returns true if Twilio account credentials are set (SID + auth token).
 * Used to determine if the platform can provision phone numbers for customers.
 * Does NOT require TWILIO_FROM_NUMBER — that's only needed for SMS.
 */
export function canProvisionNumbers(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN
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
 * @param from Optional sender number in E.164 format. Defaults to TWILIO_FROM_NUMBER env var.
 */
export async function sendSms(
  to: string,
  body: string,
  from?: string
): Promise<{ success: boolean; sid?: string }> {
  const sender = from ?? process.env.TWILIO_FROM_NUMBER
  if (!sender) throw new Error("TWILIO_FROM_NUMBER env var is required")

  const params = new URLSearchParams({
    To: to,
    From: sender,
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

/**
 * Release (delete) a provisioned phone number from the Twilio account.
 *
 * @param numberSid The Twilio IncomingPhoneNumber SID to release
 */
export async function releasePhoneNumber(numberSid: string): Promise<void> {
  const res = await fetch(`${twilioBaseUrl()}/IncomingPhoneNumbers/${numberSid}.json`, {
    method: "DELETE",
    headers: { Authorization: twilioBasicAuth() },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Twilio number release failed (${res.status}): ${text}`)
  }
}

/**
 * Search for available US phone numbers on Twilio without purchasing.
 */
export async function searchAvailableNumbers(
  params: TwilioSearchParams
): Promise<AvailableNumber[]> {
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 30)
  const searchParams = new URLSearchParams({ Limit: String(limit) })

  if (params.areaCode) searchParams.set("AreaCode", params.areaCode)
  if (params.contains) searchParams.set("Contains", params.contains)
  if (params.locality) searchParams.set("InLocality", params.locality)
  if (params.region) searchParams.set("InRegion", params.region)

  const url = `${twilioBaseUrl()}/AvailablePhoneNumbers/US/Local.json?${searchParams.toString()}`
  const res = await fetch(url, {
    headers: { Authorization: twilioBasicAuth() },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Twilio number search failed (${res.status}): ${text}`)
  }

  const data = (await res.json()) as TwilioAvailableNumbersResponse
  const available = data.available_phone_numbers ?? []

  return available.map((n) => ({
    phoneNumber: n.phone_number,
    friendlyName: n.friendly_name ?? n.phone_number,
    locality: n.locality ?? null,
    region: n.region ?? null,
    postalCode: n.postal_code ?? null,
  }))
}

/**
 * Purchase a specific phone number by its E.164 value.
 * Used after the user selects a number from search results.
 */
export async function purchaseSpecificNumber(
  phoneNumber: string
): Promise<{ phoneNumber: string; sid: string }> {
  const purchaseParams = new URLSearchParams({ PhoneNumber: phoneNumber })

  const res = await fetch(`${twilioBaseUrl()}/IncomingPhoneNumbers.json`, {
    method: "POST",
    headers: {
      Authorization: twilioBasicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: purchaseParams.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Twilio number purchase failed (${res.status}): ${text}`)
  }

  const purchased = (await res.json()) as TwilioPurchasedNumberResponse
  return { phoneNumber: purchased.phone_number, sid: purchased.sid }
}

/**
 * Validate an incoming Twilio webhook request signature.
 * Returns true if the X-Twilio-Signature header is valid.
 *
 * @param url      The full URL that Twilio POSTed to
 * @param params   The POST body params as a record
 * @param signature The X-Twilio-Signature header value
 */
export function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) return false

  // Build the data string: URL + sorted param key/value pairs concatenated
  const sortedKeys = Object.keys(params).sort()
  let data = url
  for (const key of sortedKeys) {
    data += key + params[key]
  }

  const expected = crypto
    .createHmac("sha1", authToken)
    .update(data)
    .digest("base64")

  return signature === expected
}

/**
 * Point a Twilio phone number's inbound voice handling at our webhook.
 * Twilio will POST to this URL whenever someone calls the number.
 *
 * @param numberSid  The Twilio IncomingPhoneNumber SID (e.g. PN...)
 * @param webhookUrl The full URL to our voice webhook (e.g. https://app.example.com/api/webhooks/twilio-voice)
 */
export async function configureNumberVoiceWebhook(
  numberSid: string,
  webhookUrl: string
): Promise<void> {
  const params = new URLSearchParams({
    VoiceUrl: webhookUrl,
    VoiceMethod: "POST",
  })

  const res = await fetch(`${twilioBaseUrl()}/IncomingPhoneNumbers/${numberSid}.json`, {
    method: "POST",
    headers: {
      Authorization: twilioBasicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Twilio number voice config failed (${res.status}): ${text}`)
  }
}

/**
 * Point a Twilio phone number's inbound SMS handling at our webhook.
 * Twilio will POST to this URL whenever someone texts the number.
 * Pass null for smsUrl to clear the webhook.
 *
 * @param numberSid The Twilio IncomingPhoneNumber SID (e.g. PN...)
 * @param smsUrl    The full URL to our SMS webhook, or null to clear it
 */
export async function configureNumberSmsWebhook(
  numberSid: string,
  smsUrl: string | null
): Promise<void> {
  const params = new URLSearchParams({
    SmsUrl: smsUrl ?? "",
    SmsMethod: "POST",
  })

  const res = await fetch(`${twilioBaseUrl()}/IncomingPhoneNumbers/${numberSid}.json`, {
    method: "POST",
    headers: {
      Authorization: twilioBasicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Twilio SMS webhook config failed (${res.status}): ${text}`)
  }
}
