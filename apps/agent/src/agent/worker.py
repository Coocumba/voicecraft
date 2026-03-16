"""VoiceCraft LiveKit voice agent worker.

Entry point:
    python -m src.agent.worker start

The worker connects to LiveKit, receives inbound room jobs, and runs a full
STT → LLM → TTS pipeline backed by Deepgram Nova-3, Google Gemini Flash, and
Google/ElevenLabs TTS. Agent configuration (business name, services, hours,
greeting) is fetched from the Next.js API at the start of each session so the
same worker binary can serve multiple configured agents.

Architecture
------------
- AgentServer is the long-running process that receives job dispatch from
  LiveKit and forks per-session handling.
- @server.rtc_session() marks the entrypoint called for each new session.
- DentalReceptionist is the Agent subclass that carries the tools and the
  dynamic system instructions derived from the loaded config.
- Plugins (STT/LLM/TTS) are constructed per session so each call gets a fresh
  plugin state; this is cheap and avoids shared-state bugs across concurrent
  calls.
"""

from __future__ import annotations

import os
import time
from typing import Any

import httpx
import structlog
from livekit import agents
from livekit.agents import AgentServer, AgentSession, Agent, JobContext, cli

from src.agent.config_loader import load_agent_config
from src.agent.plugins import create_stt, create_llm, create_tts
from src.agent.prompts import build_system_prompt, get_greeting
from src.agent.tools import book_appointment, check_availability, send_sms

_WEB_URL = os.environ.get("VOICECRAFT_WEB_URL", "http://localhost:3000").rstrip("/")
_API_KEY = os.environ.get("VOICECRAFT_API_KEY", "")

logger = structlog.get_logger(__name__)


def _extract_agent_id(ctx: JobContext) -> str | None:
    """Derive the agent ID from room metadata or the room name convention.

    Convention: room names follow the pattern ``voicecraft-<agent_id>-<call_id>``
    or simply ``<agent_id>``. Metadata (set by the Next.js dispatch API) takes
    priority because it is explicit and unambiguous.

    Returns None if no agent ID can be determined, which causes the worker to
    fall back to generic defaults rather than failing the call.
    """
    # Metadata is the canonical source — set it from the Next.js dispatch API.
    metadata: str = ctx.room.metadata or ""
    if metadata.strip():
        return metadata.strip()

    # Fall back to room name parsing: "voicecraft-<agent_id>-<random>"
    name_parts = ctx.room.name.split("-")
    if len(name_parts) >= 2 and name_parts[0].lower() == "voicecraft":
        return name_parts[1]

    return None


class DentalReceptionist(Agent):
    """Voice agent acting as a dental clinic receptionist.

    Constructed once per call with the system prompt derived from the loaded
    agent config. Tools are registered on the instance so they share the same
    RunContext and session.
    """

    def __init__(self, instructions: str) -> None:
        super().__init__(
            instructions=instructions,
            tools=[check_availability, book_appointment, send_sms],
        )

    async def on_enter(self) -> None:
        """Called by the framework when the agent becomes active in the session."""
        logger.debug("agent_entered_session")


async def _log_call(
    agent_id: str,
    duration_secs: int,
    outcome: str,
    caller_number: str | None = None,
    transcript: str | None = None,
    summary: str | None = None,
) -> None:
    """POST call record to the Next.js API. Fire-and-forget — never raises."""
    try:
        payload: dict[str, Any] = {
            "agentId": agent_id,
            "duration": duration_secs,
            "outcome": outcome,
        }
        if caller_number:
            payload["callerNumber"] = caller_number
        if transcript:
            payload["transcript"] = transcript
        if summary:
            payload["summary"] = summary

        async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
            resp = await client.post(
                f"{_WEB_URL}/api/calls",
                json=payload,
                headers={"x-api-key": _API_KEY, "Content-Type": "application/json"},
            )
        if resp.status_code in (200, 201):
            logger.info("call_logged", agent_id=agent_id, duration=duration_secs, outcome=outcome)
        else:
            logger.error("call_log_failed", status=resp.status_code, body=resp.text[:256])
    except Exception as exc:
        logger.error("call_log_error", error=str(exc))


server = AgentServer()


@server.rtc_session()
async def entrypoint(ctx: JobContext) -> None:
    """Session entrypoint — called once per inbound LiveKit job.

    Responsibilities:
    1. Connect to the room (audio only — we never need video).
    2. Resolve the agent ID and load its configuration from the Next.js API.
    3. Build the system prompt and instantiate STT/LLM/TTS plugins.
    4. Start the AgentSession and deliver the opening greeting.
    """
    await ctx.connect(auto_subscribe=agents.AutoSubscribe.AUDIO_ONLY)

    log = logger.bind(room=ctx.room.name)
    log.info("session_started")

    # -- Load per-agent config --------------------------------------------------
    agent_id = _extract_agent_id(ctx)
    config = await load_agent_config(agent_id) if agent_id else None

    if config is None:
        log.warning(
            "agent_config_unavailable",
            agent_id=agent_id,
            detail="falling back to default dental receptionist config",
        )

    # -- Build session components -----------------------------------------------
    system_prompt = build_system_prompt(config)
    greeting = get_greeting(config)
    voice_settings = config.get("voiceSettings") if config else None

    session = AgentSession(
        stt=create_stt(),
        llm=create_llm(system_prompt),
        tts=create_tts(voice_settings),
        userdata={"agent_id": agent_id or ""},
    )

    agent = DentalReceptionist(instructions=system_prompt)

    call_start = time.monotonic()

    # Log the call when the session shuts down
    import asyncio

    @session.on("close")
    def _on_session_close() -> None:
        if not agent_id:
            return
        duration = int(time.monotonic() - call_start)
        asyncio.create_task(_log_call(
            agent_id=agent_id,
            duration_secs=duration,
            outcome="COMPLETED",
        ))

    await session.start(agent=agent, room=ctx.room)
    log.info("session_ready")

    # Deliver the opening greeting. generate_reply with instructions tells the
    # LLM exactly what to say first rather than waiting for the caller to speak.
    await session.generate_reply(instructions=greeting)


if __name__ == "__main__":
    cli.run_app(server)
