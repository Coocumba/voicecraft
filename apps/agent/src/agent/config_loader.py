"""Load agent configuration from the Next.js API."""

import os
from typing import Any

import httpx
import structlog

logger = structlog.get_logger(__name__)

_WEB_URL = os.environ.get("VOICECRAFT_WEB_URL", "http://localhost:3000")
_API_KEY = os.environ.get("VOICECRAFT_API_KEY", "")

# Shared timeout applied to all outbound requests. Keep conservative so a
# slow Next.js API never blocks agent startup indefinitely.
_TIMEOUT = httpx.Timeout(connect=3.0, read=5.0, write=5.0, pool=2.0)


async def load_agent_config(agent_id: str) -> dict[str, Any] | None:
    """Fetch agent configuration from the Next.js API.

    Returns the config dict on success, or None if the agent is not found or
    the request fails. Failures are logged but never propagated — the caller
    must always handle a None return and fall back to sensible defaults.

    Args:
        agent_id: Opaque identifier supplied via LiveKit room name or metadata.
    """
    if not agent_id:
        return None

    url = f"{_WEB_URL}/api/agents/{agent_id}"
    log = logger.bind(agent_id=agent_id, url=url)

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.get(
                url,
                headers={"x-api-key": _API_KEY},
            )

        if response.status_code == 404:
            log.warning("agent_config_not_found")
            return None

        if response.status_code != 200:
            log.error(
                "agent_config_fetch_failed",
                status_code=response.status_code,
                body=response.text[:256],
            )
            return None

        data: dict[str, Any] = response.json()
        # API returns {"agent": {...}} — extract the agent object
        agent_data = data.get("agent", data)
        # Merge the nested config into the top-level agent data so prompts.py
        # can access both agent-level fields (businessName) and config fields
        # (services, hours, greeting, etc.)
        config = agent_data.get("config", {})
        if isinstance(config, dict):
            result = {**config, **{k: v for k, v in agent_data.items() if k != "config"}}
        else:
            result = dict(agent_data)
        log.info("agent_config_loaded", keys=list(result.keys()))
        return result

    except httpx.TimeoutException:
        log.error("agent_config_timeout")
        return None
    except httpx.RequestError as exc:
        log.error("agent_config_request_error", error=str(exc))
        return None
    except Exception as exc:
        # Never let a config-load failure crash the worker.
        log.error("agent_config_unexpected_error", error=str(exc))
        return None
