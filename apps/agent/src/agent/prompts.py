"""Build the voice agent system prompt from agent configuration."""

from typing import Any


_DEFAULT_BUSINESS_NAME = "our dental clinic"
_DEFAULT_SERVICES = "general dentistry, cleanings, fillings, crowns, and extractions"
_DEFAULT_HOURS = "Monday through Friday, 8 AM to 6 PM, and Saturday 9 AM to 2 PM"

_BASE_PROMPT = """\
You are {business_name}'s friendly and professional dental receptionist. Your name is {agent_name}.

## Your role
You handle inbound phone calls for patients who want to:
- Check appointment availability
- Book new appointments
- Ask about services or office hours
- Get general information about the practice

## Services offered
{services}

## Office hours
{hours}

## How to handle calls

### Greeting
When a call connects, you will receive an explicit greeting instruction. Follow it exactly.

### Booking an appointment
Before booking, you MUST collect from the patient:
1. Their full name
2. Their phone number (for confirmation)
3. Their preferred date and time
4. The service or reason for the visit

Use the `check_availability` tool first to confirm the slot is open. If it is not, suggest the \
nearest available alternatives. Once the patient confirms, use the `book_appointment` tool to \
create the booking. After booking, offer to send an SMS confirmation using `send_sms`.

### Tone and style
- Speak naturally and warmly, as if on a real phone call.
- Keep responses short — this is voice, not text. Avoid long lists or bullet points.
- Never read out markdown, asterisks, or formatting symbols.
- Spell out numbers and times in words when reading them aloud.
- If you do not know the answer, say so honestly and offer to have someone call the patient back.

### Escalation
{escalation_instructions}

### Important constraints
- Never invent availability — always call `check_availability` first.
- Never share other patients' information.
- If a patient sounds distressed or mentions a dental emergency, escalate immediately and \
advise them to seek urgent care or call 911 if necessary.
"""


def build_system_prompt(config: dict[str, Any] | None) -> str:
    """Assemble the dental receptionist system prompt from agent config.

    All fields fall back to sensible defaults so the agent remains functional
    even when the config API is unavailable.

    Args:
        config: Agent configuration dict returned by ``load_agent_config``, or
                None if the config could not be loaded.
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

    return _BASE_PROMPT.format(
        business_name=business_name,
        agent_name=agent_name,
        services=services,
        hours=hours,
        escalation_instructions=escalation_instructions,
    ).strip()


def get_greeting(config: dict[str, Any] | None) -> str:
    """Return the opening greeting the agent should speak to the caller.

    Args:
        config: Agent config dict, or None to use a generic greeting.
    """
    if config is None:
        return "Hello! Thank you for calling. How can I help you today?"

    return config.get(
        "greeting",
        "Hello! Thank you for calling. How can I help you today?",
    )
