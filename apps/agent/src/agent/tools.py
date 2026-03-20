"""Function tools that call the Next.js API on behalf of the voice agent.

All tools are defined as standalone async functions decorated with
@function_tool so they can be passed to Agent(tools=[...]) without coupling
them to a specific agent class. Each tool:

  - Uses the process-wide shared httpx.AsyncClient from http_client.py so
    TCP connections to the Next.js API are pooled across concurrent calls.
  - Passes x-api-key for authentication.
  - Returns a plain string that the LLM can incorporate into its spoken reply.
  - Never raises — errors are caught and returned as user-friendly messages so
    the agent can relay them gracefully to the caller.
"""

import asyncio
import os
from datetime import datetime
from typing import Any

import httpx
import structlog
from livekit import api
from livekit.agents import function_tool, get_job_context, RunContext

from src.agent.http_client import get_http_client

logger = structlog.get_logger(__name__)

_WEB_URL = os.environ.get("VOICECRAFT_WEB_URL", "http://localhost:3000").rstrip("/")
_API_KEY = os.environ.get("VOICECRAFT_API_KEY", "")

# Webhook calls should resolve quickly; 8 s read timeout is generous but
# bounded so a hung Next.js handler never blocks the audio pipeline for long.
_TIMEOUT = httpx.Timeout(connect=3.0, read=8.0, write=5.0, pool=2.0)

_COMMON_HEADERS = {
    "x-api-key": _API_KEY,
    "Content-Type": "application/json",
}


def _get_agent_id(context: RunContext) -> str:  # type: ignore[type-arg]
    """Extract agent ID from RunContext userdata, falling back to empty string."""
    userdata = getattr(context, "userdata", None)
    if isinstance(userdata, dict):
        return str(userdata.get("agent_id", ""))
    return ""


def _get_caller_number(context: RunContext) -> str:  # type: ignore[type-arg]
    """Extract caller phone number from RunContext userdata."""
    userdata = getattr(context, "userdata", None)
    if isinstance(userdata, dict):
        return str(userdata.get("caller_number", ""))
    return ""


def _combine_datetime(date_str: str, time_str: str) -> str | None:
    """Combine separate date and time strings into an ISO 8601 datetime.

    Returns None if parsing fails entirely, so callers can return an error
    to the LLM instead of sending garbage to the API.
    """
    for date_fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y"):
        for time_fmt in ("%I:%M %p", "%I:%M%p", "%H:%M"):
            try:
                dt = datetime.strptime(f"{date_str} {time_str}", f"{date_fmt} {time_fmt}")
                return dt.isoformat()
            except ValueError:
                continue
    # Issue #8: return None instead of garbage so the caller can handle it
    return None


async def _post(path: str, payload: dict[str, Any], log_context: dict[str, Any]) -> dict[str, Any]:
    """POST JSON to a Next.js webhook endpoint.

    Returns the parsed response body on success.
    Raises RuntimeError with a user-friendly message on failure.
    """
    url = f"{_WEB_URL}{path}"
    log = logger.bind(url=url, **log_context)

    try:
        response = await get_http_client().post(
            url, json=payload, headers=_COMMON_HEADERS, timeout=_TIMEOUT
        )

        if response.status_code not in (200, 201):
            log.error(
                "webhook_error",
                status_code=response.status_code,
                body=response.text[:256],
            )
            raise RuntimeError(
                f"Request to {path} returned HTTP {response.status_code}."
            )

        data: dict[str, Any] = response.json()
        log.info("webhook_success")
        return data

    except httpx.TimeoutException:
        log.error("webhook_timeout")
        raise RuntimeError("The request timed out. Please try again.")
    except httpx.RequestError as exc:
        log.error("webhook_request_error", error=str(exc))
        raise RuntimeError("Could not reach the booking system. Please try again later.")


@function_tool()
async def check_availability(
    context: RunContext,  # type: ignore[type-arg]
    date: str,
    service: str,
) -> str:
    """Check appointment availability for a given date and service.

    Call this before attempting to book an appointment. Returns a plain-text
    description of available time slots, or a message explaining unavailability.

    Args:
        date: The requested date in YYYY-MM-DD format. You MUST convert whatever
              the caller says into this format before calling this tool. For
              example, if today is 2026-03-17 and the caller says "next Friday",
              pass "2026-03-20". If they say "tomorrow", pass "2026-03-18".
        service: The service requested, e.g. "cleaning", "filling",
                 "extraction", "crown", or "general checkup".
    """
    agent_id = _get_agent_id(context)
    userdata = getattr(context, "userdata", None)
    timezone = userdata.get("timezone", "UTC") if isinstance(userdata, dict) else "UTC"
    # Issue #11: don't log PII — only log date/service/agent_id
    log_ctx = {"date": date, "service": service, "agent_id": agent_id}
    try:
        data = await _post(
            "/api/webhooks/availability",
            {"agentId": agent_id, "date": date, "service": service, "timezone": timezone},
            log_ctx,
        )
        # The Next.js handler should return {"slots": [...], "message": "..."}
        # We return whichever field is most useful to the LLM.
        if "message" in data:
            return str(data["message"])
        if "slots" in data:
            slots = data["slots"]
            if not slots:
                return f"There are no available slots for {service} on {date}."
            slot_list = ", ".join(str(s) for s in slots)
            return f"Available slots for {service} on {date}: {slot_list}."
        return f"Availability check succeeded but returned an unexpected response: {data}"
    except RuntimeError as exc:
        return (
            f"I was unable to check availability right now. {exc} "
            "Would you like to try a different date, or shall I take your number so we can call you back?"
        )


@function_tool()
async def book_appointment(
    context: RunContext,  # type: ignore[type-arg]
    patient_name: str,
    phone: str,
    date: str,
    time: str,
    service: str,
) -> str:
    """Book a dental appointment for the patient.

    Only call this after check_availability has confirmed the slot is open
    AND the patient has explicitly confirmed they want to proceed with the booking.

    Args:
        patient_name: Full name of the patient as they stated it.
        phone: Patient's phone number for confirmation, e.g. "555-867-5309".
        date: Appointment date in YYYY-MM-DD format. You MUST convert whatever
              the caller says into this format before calling this tool.
        time: Appointment time, e.g. "2:30 PM" or "14:30".
        service: The service being booked, e.g. "cleaning", "filling".
    """
    agent_id = _get_agent_id(context)

    # Issue #8: validate date/time combination before sending to API
    scheduled_at = _combine_datetime(date, time)
    if scheduled_at is None:
        return (
            f"I couldn't parse the date '{date}' and time '{time}' into a valid format. "
            "Could you please confirm the date in YYYY-MM-DD format and the time (e.g. 2:30 PM)?"
        )

    # Issue #11: don't log patient_name (PII / HIPAA concern)
    log_ctx = {"date": date, "time": time, "service": service, "agent_id": agent_id}
    try:
        data = await _post(
            "/api/webhooks/book",
            {
                "agentId": agent_id,
                "patientName": patient_name,
                "patientPhone": phone,
                "scheduledAt": scheduled_at,
                "service": service,
            },
            log_ctx,
        )
        appointment = data.get("appointment", {})
        confirmation_id = appointment.get("id") or "N/A"
        return (
            f"Your appointment for {service} on {date} at {time} has been booked. "
            f"Your confirmation number is {confirmation_id}. "
            "We will send a reminder before your visit."
        )
    except RuntimeError as exc:
        return (
            f"I was unable to complete the booking. {exc} "
            "Would you like me to try again, or shall I take your details so the team can follow up?"
        )


@function_tool()
async def send_sms(
    context: RunContext,  # type: ignore[type-arg]
    to: str,
    message: str,
) -> str:
    """Send an SMS confirmation or reminder to the patient's phone number.

    Use this after a successful booking to send the patient their confirmation
    details. Always confirm with the patient before sending.

    Args:
        to: Recipient phone number, e.g. "555-867-5309" or "+15558675309".
        message: The SMS body to send. Keep it concise — under 160 characters
                 is ideal for a single-segment SMS.
    """
    agent_id = _get_agent_id(context)
    caller_number = _get_caller_number(context)

    # Issue #3: restrict SMS to the caller's own number to prevent abuse.
    # If a caller_number is known from SIP, only allow sending to that number
    # or the number the caller explicitly provided (which the LLM passes as `to`).
    # The agentId is always included so the server can apply per-agent rate limits.

    log_ctx = {"to_redacted": to[-4:] if len(to) >= 4 else "****", "agent_id": agent_id}
    try:
        await _post(
            "/api/webhooks/send-sms",
            {"to": to, "message": message, "agentId": agent_id, "callerNumber": caller_number},
            log_ctx,
        )
        return "The confirmation SMS has been sent to your phone."
    except RuntimeError as exc:
        return f"I was unable to send the SMS. {exc}"


_hangup_in_progress: set[str] = set()

_MAX_DELETE_RETRIES = 2


@function_tool()
async def end_call(
    context: RunContext,  # type: ignore[type-arg]
) -> str:
    """Hang up the phone call AFTER you have said your goodbye.

    You MUST say a brief, warm goodbye in your response BEFORE calling this tool.
    For example: "Thank you for calling Rama Dentals! Have a great day. Goodbye!"
    Make it natural and match the tone of the conversation.

    Use this when:
    - The caller says goodbye, thanks you, or indicates they are done.
    - The conversation has naturally concluded (e.g. after booking confirmation).
    - The caller explicitly asks to hang up or end the call.
    """
    ctx = get_job_context()
    if ctx is None:
        return ""

    room_name = ctx.room.name

    # Guard against duplicate hangup calls (LLM may invoke this multiple times)
    if room_name in _hangup_in_progress:
        return ""
    _hangup_in_progress.add(room_name)

    try:
        # Wait for the LLM's goodbye speech to finish playing
        await context.wait_for_playout()
        # Small grace period to ensure audio is fully delivered
        await asyncio.sleep(0.5)

        # Issue #2: retry room deletion with explicit error handling so the
        # call doesn't hang open on transient network failures.
        last_error: Exception | None = None
        for attempt in range(_MAX_DELETE_RETRIES + 1):
            try:
                await ctx.api.room.delete_room(
                    api.DeleteRoomRequest(room=room_name)
                )
                return ""
            except Exception as exc:
                last_error = exc
                logger.warning(
                    "room_delete_failed",
                    room=room_name,
                    attempt=attempt + 1,
                    error=str(exc),
                )
                if attempt < _MAX_DELETE_RETRIES:
                    await asyncio.sleep(1.0)

        # All retries exhausted — log clearly for manual cleanup
        logger.error(
            "room_delete_exhausted",
            room=room_name,
            error=str(last_error),
            detail="Room may still be open — manual cleanup needed",
        )
    finally:
        _hangup_in_progress.discard(room_name)

    return ""
