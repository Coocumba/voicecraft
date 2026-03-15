// Twilio SIP trunk configuration utilities.
// Configures Twilio to forward inbound PSTN calls to a LiveKit SIP URI so the
// LiveKit voice agent can handle them.
//
// This is intentionally a placeholder: the exact Elastic SIP Trunk configuration
// depends on whether the account uses Elastic SIP Trunking (BEST) or a legacy
// SIP domain application.  The log output here documents the steps an operator
// would take or automate via the Twilio Trunking API.

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

interface TwilioTrunkResponse {
  sid: string
  friendly_name: string
  domain_name: string
}

/**
 * Configure a Twilio SIP trunk to forward inbound calls to a LiveKit SIP URI.
 *
 * In a real deployment this would:
 *   1. Create (or update) an Elastic SIP Trunk via the Trunking API.
 *   2. Associate the purchased phone number with the trunk.
 *   3. Set the trunk's origination URI to the LiveKit SIP ingress endpoint.
 *
 * Currently creates the trunk and logs the remaining manual/automation steps.
 */
export async function configureSipTrunk(
  phoneNumber: string,
  livekitSipUri: string
): Promise<void> {
  console.info("[SIP] Configuring Twilio SIP trunk", {
    phoneNumber,
    livekitSipUri,
  })

  // Step 1: Create a Trunking SIP trunk.
  const trunkParams = new URLSearchParams({
    FriendlyName: `VoiceCraft LiveKit trunk (${phoneNumber})`,
  })

  const trunkRes = await fetch("https://trunking.twilio.com/v1/Trunks", {
    method: "POST",
    headers: {
      Authorization: twilioBasicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: trunkParams.toString(),
  })

  if (!trunkRes.ok) {
    const text = await trunkRes.text()
    console.error("[SIP] Failed to create Twilio trunk", { status: trunkRes.status, body: text })
    // Non-fatal: log and continue — the operator can configure manually.
    console.warn("[SIP] Manual configuration required — see inline comments in twilio-sip.ts")
    return
  }

  const trunk = (await trunkRes.json()) as TwilioTrunkResponse

  console.info("[SIP] Trunk created", { sid: trunk.sid, domainName: trunk.domain_name })

  // Step 2: Associate the phone number with the trunk.
  // Requires the IncomingPhoneNumber SID, which is not passed here.
  // Operator action: POST /v1/Trunks/{TrunkSid}/PhoneNumbers with PhoneNumberSid.

  // Step 3: Add the LiveKit SIP URI as an origination URL.
  const originationParams = new URLSearchParams({
    SipUrl: livekitSipUri,
    FriendlyName: "LiveKit SIP ingress",
    Priority: "10",
    Weight: "10",
    Enabled: "true",
  })

  const originationRes = await fetch(
    `https://trunking.twilio.com/v1/Trunks/${trunk.sid}/OriginationUrls`,
    {
      method: "POST",
      headers: {
        Authorization: twilioBasicAuth(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: originationParams.toString(),
    }
  )

  if (!originationRes.ok) {
    const text = await originationRes.text()
    console.error("[SIP] Failed to set origination URL", {
      status: originationRes.status,
      body: text,
    })
    return
  }

  console.info("[SIP] SIP trunk configured successfully", {
    trunkSid: trunk.sid,
    livekitSipUri,
    phoneNumber,
    nextStep: `Associate phone number ${phoneNumber} with trunk SID ${trunk.sid} via Twilio Console or API`,
  })

  // Also update the phone number's voice URL via the base API so TwiML can point
  // at the trunk. This is done by updating the IncomingPhoneNumber resource.
  // Operator action: PATCH /2010-04-01/Accounts/{AccountSid}/IncomingPhoneNumbers/{Sid}.json
  //   with VoiceUrl=<twiml_app_or_trunk_url>

  console.info("[SIP] Remaining manual step: link phone number to trunk SID via Twilio Console", {
    trunkSid: trunk.sid,
    phoneNumber,
    twilioBaseUrl: twilioBaseUrl(),
  })
}
