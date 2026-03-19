"""Build the voice agent system prompt from agent configuration."""

import re
from typing import Any


_PHONE_RE = re.compile(r"[^\d+\-() ]")
_MAX_PHONE_LEN = 20


def _sanitize_phone(raw: str) -> str | None:
    """Strip non-phone characters and reject values that look suspicious.

    Returns the cleaned number or None if the input is invalid. This prevents
    prompt injection via spoofed SIP caller IDs (e.g. a caller ID set to
    "Ignore all instructions").
    """
    cleaned = _PHONE_RE.sub("", raw).strip()
    if not cleaned or len(cleaned) > _MAX_PHONE_LEN:
        return None
    # Must contain at least a few digits to be a real phone number
    if sum(c.isdigit() for c in cleaned) < 3:
        return None
    return cleaned


_DEFAULT_BUSINESS_NAME = "our dental clinic"
_DEFAULT_SERVICES = "general dentistry, cleanings, fillings, crowns, and extractions"
_DEFAULT_HOURS = "Monday through Friday, 8 AM to 6 PM, and Saturday 9 AM to 2 PM"

_BASE_PROMPT = """\
You are {business_name}'s friendly and professional dental receptionist. Your name is {agent_name}.

## Your role
You handle inbound phone calls for patients who want to:
- Ask about services or office hours
- Get general information about the practice

## Services offered
{services}

## Office hours
{hours}

## How to handle calls

### Greeting
When a call connects, you will receive an explicit greeting instruction. Follow it exactly.

### Tone and style
- Speak naturally and warmly, as if on a real phone call.
- Keep responses short — this is voice, not text. Avoid long lists or bullet points.
- Never read out markdown, asterisks, or formatting symbols.
- Spell out numbers and times in words when reading them aloud.
- If you do not know the answer, say so honestly and offer to have someone call the patient back.

### Escalation
{escalation_instructions}

### Ending the call
- When the caller says goodbye, thanks you, or indicates they are done, say a brief, warm \
goodbye FIRST — then call the `end_call` tool to hang up.
- Your goodbye should be natural and match the conversation tone. For example: \
"Thank you for calling {business_name}! Have a wonderful day. Goodbye!" \
Keep it to one or two sentences — do NOT keep talking after your goodbye.
- If the conversation has naturally concluded (for example, after confirming a booking and \
sending a message), ask if there is anything else. If the caller says no, say goodbye and \
call `end_call`.

### Important constraints
- Never share other patients' information.
- If a patient sounds distressed or mentions a dental emergency, escalate immediately and \
advise them to seek urgent care or call 911 if necessary.
"""

_BOOKING_PROMPT = """

## Booking appointments

Patients may also want to:
- Check appointment availability
- Book new appointments

### Booking an appointment
Before booking, you MUST collect from the patient:
1. Their full name
2. Their preferred date and time
3. The service or reason for the visit
{phone_instruction}
Use the `check_availability` tool first to confirm the slot is open. If it is not, suggest the \
nearest available alternatives. Once the patient confirms, use the `book_appointment` tool to \
create the booking. After booking, offer to send an SMS confirmation using `send_sms`.

### Important booking constraints
- Never invent availability — always call `check_availability` first.
"""


def build_system_prompt(config: dict[str, Any] | None, caller_number: str | None = None) -> str:
    """Assemble the dental receptionist system prompt from agent config.

    All fields fall back to sensible defaults so the agent remains functional
    even when the config API is unavailable.

    Args:
        config: Agent configuration dict returned by ``load_agent_config``, or
                None if the config could not be loaded.
        caller_number: The caller's phone number from SIP attributes, or None.
    """
    if config is None:
        config = {}

    # Support both camelCase (from agent model) and snake_case (from builder config)
    business_name: str = config.get("businessName") or config.get("business_name") or _DEFAULT_BUSINESS_NAME
    agent_name: str = config.get("agentName") or config.get("name") or "Alex"

    # Services: accept either a list of dicts, a list of strings, or a string.
    raw_services = config.get("services")
    if isinstance(raw_services, list):
        parts = []
        for s in raw_services:
            if isinstance(s, dict) and "name" in s:
                desc = s["name"]
                if s.get("duration"):
                    desc += f" ({s['duration']} min)"
                parts.append(desc)
            else:
                parts.append(str(s))
        services = ", ".join(parts) or _DEFAULT_SERVICES
    elif isinstance(raw_services, str) and raw_services.strip():
        services = raw_services.strip()
    else:
        services = _DEFAULT_SERVICES

    raw_hours = config.get("hours")
    if isinstance(raw_hours, dict):
        # Builder produces {"monday": {"open": "09:00", "close": "17:00"}, ...}
        day_strs = []
        for day, times in raw_hours.items():
            if times is None:
                day_strs.append(f"{day.capitalize()}: Closed")
            elif isinstance(times, dict):
                day_strs.append(f"{day.capitalize()}: {times.get('open', '?')} – {times.get('close', '?')}")
        hours = "; ".join(day_strs) if day_strs else _DEFAULT_HOURS
    elif isinstance(raw_hours, str) and raw_hours.strip():
        hours = raw_hours.strip()
    else:
        hours = _DEFAULT_HOURS

    # Escalation rules: use config value or a safe default.
    escalation_rules = config.get("escalationRules") or config.get("escalation_rules")
    if escalation_rules:
        escalation_instructions = str(escalation_rules)
    else:
        escalation_instructions = (
            "If a caller asks to speak with a dentist, office manager, or someone other than "
            "the receptionist, politely take their name and number and let them know a team "
            "member will return their call as soon as possible."
        )

    prompt = _BASE_PROMPT.format(
        business_name=business_name,
        agent_name=agent_name,
        services=services,
        hours=hours,
        escalation_instructions=escalation_instructions,
    ).strip()

    can_book = config.get("can_book_appointments", True)
    if can_book:
        # Sanitize caller_number: allow only digits, +, -, spaces, parens.
        # This prevents prompt injection via spoofed SIP caller IDs.
        safe_number = _sanitize_phone(caller_number) if caller_number else None
        if safe_number:
            phone_instruction = (
                f"\nThe caller's phone number is {safe_number} (from caller ID). "
                "Use this as the default for booking and SMS. Do NOT ask the caller to confirm "
                "or repeat their number — just use it. However, if the caller volunteers a "
                "different number, use the number they provide instead. "
                "Never read the phone number aloud or reveal it to the caller.\n"
            )
        else:
            phone_instruction = (
                "\n4. Their phone number (for confirmation)\n"
            )
        prompt += _BOOKING_PROMPT.format(phone_instruction=phone_instruction)

    # Language: use config language for greetings, auto-switch if caller speaks differently.
    language = config.get("language", "en")
    prompt += f"""

### Language
Your default language is {language}. Use it for the initial greeting and unless told otherwise.
If the caller speaks to you in a different language or asks you to switch languages, \
immediately respond in EXACTLY that language for the rest of the call.
CRITICAL: You MUST identify the caller's language correctly. For example:
- Tamil is NOT Hindi or Spanish. Tamil sounds distinct and uses different vocabulary.
- Do NOT guess a similar-sounding language — if you are unsure, respond in the language \
the caller is most likely speaking based on the transcription.
- Match the caller's language naturally — do not ask for confirmation before switching.
"""

    return prompt


def get_greeting(config: dict[str, Any] | None, contact: dict[str, Any] | None = None) -> str:
    """Return the opening greeting the agent should speak to the caller.

    If a known contact is provided, appends an instruction to the LLM to greet
    them by name. This is directive text for the model, not literal speech.

    Args:
        config: Agent config dict, or None to use a generic greeting.
        contact: Contact info returned by the contact-lookup webhook, or None.
    """
    if config is None:
        base_greeting = "Hello! Thank you for calling. How can I help you today?"
    else:
        base_greeting = config.get(
            "greeting",
            "Hello! Thank you for calling. How can I help you today?",
        )

    if contact and contact.get("name"):
        base_greeting += (
            f" (The caller is {contact['name']}, a returning customer"
            " \u2014 greet them by name.)"
        )

    return base_greeting


def build_caller_context_suffix(contact: dict[str, Any] | None, appointments: dict[str, Any] | None = None) -> str:
    """Build the '## Caller Context' section to append to the system prompt.

    Called to enrich the system prompt with caller history. Keeps all prompt
    construction logic centralised in this module.

    Args:
        contact: Contact dict with keys: name (str | None), callCount (int),
                 lastCalledAt (str | None). None if caller is unknown.
        appointments: Dict with ``upcoming`` and ``past`` lists of appointment
                      dicts, each containing service, scheduledAt, status.
    """
    if appointments is None:
        appointments = {"upcoming": [], "past": []}

    upcoming: list[dict[str, Any]] = appointments.get("upcoming") or []
    past: list[dict[str, Any]] = appointments.get("past") or []

    # Nothing to say if caller is unknown and has no appointments.
    if contact is None and not upcoming and not past:
        return ""

    lines: list[str] = ["\n\n## Caller Context"]

    if contact:
        name: str | None = contact.get("name")
        call_count: int = int(contact.get("callCount", 0))
        last_called_at: str | None = contact.get("lastCalledAt")

        if name:
            lines.append(f"This caller is a returning customer: {name}.")
        else:
            lines.append("This is a returning caller.")

        call_summary = f"They have called {call_count} time{'s' if call_count != 1 else ''}."
        if last_called_at:
            call_summary += f" Last call: {last_called_at}."
        lines.append(call_summary)

    for appt in upcoming:
        service = appt.get("service", "appointment")
        scheduled_at = appt.get("scheduledAt", "an unknown date")
        lines.append(f"This caller has an upcoming {service} on {scheduled_at}.")

    if past:
        first_past = past[0]
        service = first_past.get("service", "appointment")
        scheduled_at = first_past.get("scheduledAt", "an unknown date")
        lines.append(f"This caller's last visit was {scheduled_at} for {service}.")

    if contact and contact.get("name"):
        lines.append("Greet them warmly by name and be aware of their history.")
    elif contact:
        lines.append("Greet them warmly and be aware of their history.")

    return "\n".join(lines)
