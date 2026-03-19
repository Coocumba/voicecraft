"""Factory functions for STT, LLM, and TTS plugin instances."""

import os
from typing import Any

import structlog

logger = structlog.get_logger(__name__)


def create_stt(language: str | None = None):
    """Return a Deepgram Nova-3 STT plugin instance.

    Args:
        language: BCP-47 language code (e.g. "en", "es", "hi"). If provided,
                  Deepgram will transcribe in that language. If None or "en",
                  defaults to English.
    """
    from livekit.plugins import deepgram

    kwargs: dict[str, str] = {"model": "nova-3"}
    if language and language.lower() not in ("en", "english"):
        kwargs["language"] = language.lower()
        logger.info("stt_language_set", language=language)

    return deepgram.STT(**kwargs)


def create_llm(system_prompt: str):
    """Return a Google Gemini LLM plugin instance."""
    from livekit.plugins import google

    _ = system_prompt  # applied via Agent(instructions=...) in worker.py
    model = os.environ.get("LLM_MODEL", "gemini-2.5-flash")
    logger.info("llm_model_selected", model=model)
    return google.LLM(model=model)


def create_tts(voice_settings: dict[str, Any] | None = None):
    """Return a TTS plugin instance.

    Voice settings from the agent config take priority over env vars.
    Expected voice_settings shape: { "provider": "openai", "voice": "nova", "model": "..." }
    """
    settings = voice_settings or {}

    provider = (
        settings.get("provider")
        or os.environ.get("TTS_PROVIDER", "openai")
    ).lower()

    if provider == "elevenlabs":
        voice_id = settings.get("voiceId") or settings.get("voice_id") or "21m00Tcm4TlvDq8ikWAM"
        api_key = os.environ.get("ELEVEN_API_KEY") or os.environ.get("ELEVENLABS_API_KEY")
        if api_key:
            os.environ["ELEVEN_API_KEY"] = api_key
            try:
                from livekit.plugins import elevenlabs
                logger.info("tts_provider_selected", provider="elevenlabs", voice_id=voice_id)
                return elevenlabs.TTS(voice_id=voice_id)
            except Exception as exc:
                logger.warning("elevenlabs_init_failed", error=str(exc))

    if provider == "openai" or provider != "elevenlabs":
        try:
            from livekit.plugins import openai
            voice = settings.get("voice") or os.environ.get("TTS_VOICE", "alloy")
            model = settings.get("model") or os.environ.get("TTS_MODEL", "gpt-4o-mini-tts")
            logger.info("tts_provider_selected", provider="openai", voice=voice, model=model)
            return openai.TTS(voice=voice, model=model)
        except Exception as exc:
            logger.warning("openai_tts_init_failed", error=str(exc))

    # Final fallback: Google Cloud TTS
    from livekit.plugins import google
    logger.info("tts_provider_selected", provider="google")
    return google.TTS(gender="female", voice_name="en-US-Wavenet-F")
