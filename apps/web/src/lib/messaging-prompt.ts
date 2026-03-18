import type { AgentConfig, ServiceItem, DayHours } from "@/lib/builder-types"

const DAY_NAMES: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
}

function formatService(service: ServiceItem): string {
  const parts: string[] = [service.name]
  if (service.duration) parts.push(`${service.duration} min`)
  if (service.price) parts.push(`$${service.price}`)
  return parts.join(" — ")
}

function formatHours(hours: Record<string, DayHours | null>): string {
  const lines: string[] = []
  for (const [day, slot] of Object.entries(hours)) {
    const label = DAY_NAMES[day.toLowerCase()] ?? day
    if (slot === null) {
      lines.push(`  ${label}: Closed`)
    } else {
      lines.push(`  ${label}: ${slot.open} – ${slot.close}`)
    }
  }
  return lines.join("\n")
}

/**
 * Build a system prompt for the WhatsApp messaging bot from an AgentConfig.
 *
 * The prompt instructs the LLM to respond with a JSON object containing:
 *   { reply, handoff, action, actionData }
 */
export function buildMessagingSystemPrompt(config: AgentConfig): string {
  const businessName = config.business_name ?? "this business"
  const tone = config.tone ?? "friendly and professional"
  const timezone = config.timezone ?? "America/New_York"

  const servicesSection =
    config.services && config.services.length > 0
      ? `SERVICES OFFERED:\n${config.services.map(formatService).map((s) => `  - ${s}`).join("\n")}`
      : "SERVICES OFFERED:\n  (not specified)"

  const hoursSection =
    config.hours && Object.keys(config.hours).length > 0
      ? `BUSINESS HOURS (${timezone}):\n${formatHours(config.hours)}`
      : `BUSINESS HOURS:\n  (not specified)`

  const canBook = config.can_book_appointments === true

  return `You are a WhatsApp assistant for ${businessName}. Your job is to help customers via WhatsApp messages.

TONE: ${tone}

${servicesSection}

${hoursSection}

CAPABILITIES:
${canBook ? "  - You CAN check appointment availability and book appointments." : "  - You cannot book appointments — direct customers to call if they need scheduling."}
  - You can answer questions about services, pricing, and hours.
  - If you cannot help or the customer is upset, set handoff to true so a human can follow up.

RESPONSE FORMAT:
You must ALWAYS respond with valid JSON in this exact format:
{
  "reply": "<your WhatsApp reply to the customer — conversational but concise>",
  "handoff": <true if a human should follow up, false otherwise>,
  "action": <"check_availability" | "book" | "cancel" | null>,
  "actionData": <object with relevant data for the action, or omit if action is null>
}

RULES:
- Keep replies conversational and concise.
- Never reveal that you are an AI unless directly asked.
- If asked about something outside your knowledge, say you'll have someone follow up (set handoff: true).
- For appointment booking, use action "check_availability" first to confirm a slot is open, then "book" to confirm.
- Always be polite and represent ${businessName} professionally.
- Do not include any text outside the JSON object in your response.`
}
