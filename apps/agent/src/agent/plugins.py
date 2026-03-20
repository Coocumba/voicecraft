"""Factory functions for STT, LLM, and TTS plugin instances."""

import os
from typing import Any

import structlog

logger = structlog.get_logger(__name__)

# Deepgram endpointing tuning for phone conversations.
#
# _STT_ENDPOINTING_MS: silence duration (ms) after speech before Deepgram emits
# a final transcript. 300 ms is aggressive but appropriate for phone calls where
# callers expect a quick response — the default (500 ms) adds noticeable lag
# between the caller finishing a sentence and the LLM firing.
#
# _STT_UTTERANCE_END_MS: maximum silence (ms) allowed within a single utterance
# before it is split. 1000 ms prevents the agent from interrupting mid-sentence
# while still bounding how long it waits for a trailing word.
_STT_ENDPOINTING_MS = 300
_STT_UTTERANCE_END_MS = 1000


def create_stt(language: str | None = None):
    """Return a Deepgram Nova-3 STT plugin instance.

    If a language is configured, Deepgram will use it for more accurate
    transcription. If not set or set to "en", omits the language param
    so Nova-3 defaults to English.

    Args:
        language: BCP-47 language code from agent config (e.g. "ta", "es", "hi").
    """
    from livekit.plugins import deepgram

    lang = (language or "en").lower().strip()
    if lang in ("en", "english"):
        logger.info("stt_created", language="en", mode="default")
        return deepgram.STT(
            model="nova-3",
            endpointing_ms=_STT_ENDPOINTING_MS,
            utterance_end_ms=_STT_UTTERANCE_END_MS,
        )

    logger.info("stt_created", language=lang, mode="language-specific")
    return deepgram.STT(
        model="nova-3",
        language=lang,
        endpointing_ms=_STT_ENDPOINTING_MS,
        utterance_end_ms=_STT_UTTERANCE_END_MS,
    )


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

    # Issue #8: use explicit if/elif/else so "google" config doesn't silently use OpenAI
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
        # Fall through to OpenAI if ElevenLabs key missing or init failed

    if provider == "google":
        from livekit.plugins import google
        logger.info("tts_provider_selected", provider="google")
        return google.TTS(gender="female", voice_name="en-US-Wavenet-F")

    # Default: OpenAI TTS (covers provider == "openai" and fallback from failed ElevenLabs)
    try:
        from livekit.plugins import openai
        voice = settings.get("voice") or os.environ.get("TTS_VOICE", "alloy")
        model = settings.get("model") or os.environ.get("TTS_MODEL", "gpt-4o-mini-tts")
        logger.info("tts_provider_selected", provider="openai", voice=voice, model=model)
        return openai.TTS(voice=voice, model=model)
    except Exception as exc:
        logger.warning("openai_tts_init_failed", error=str(exc))

    # Last resort fallback: Google Cloud TTS
    from livekit.plugins import google as google_tts
    logger.info("tts_provider_selected", provider="google", fallback=True)
    return google_tts.TTS(gender="female", voice_name="en-US-Wavenet-F")
