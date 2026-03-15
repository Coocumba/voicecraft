"""Factory functions for STT, LLM, and TTS plugin instances."""

import os
import structlog

logger = structlog.get_logger(__name__)


def create_stt():
    """Return a Deepgram Nova-3 STT plugin instance."""
    from livekit.plugins import deepgram

    return deepgram.STT(model="nova-3")


def create_llm(system_prompt: str):
    """Return a Google Gemini LLM plugin instance."""
    from livekit.plugins import google

    _ = system_prompt  # applied via Agent(instructions=...) in worker.py
    model = os.environ.get("LLM_MODEL", "gemini-2.5-flash")
    logger.info("llm_model_selected", model=model)
    return google.LLM(model=model)


def create_tts():
    """Return a TTS plugin instance. Uses OpenAI TTS by default."""
    provider = os.environ.get("TTS_PROVIDER", "openai").lower()

    if provider == "elevenlabs":
        api_key = os.environ.get("ELEVEN_API_KEY") or os.environ.get("ELEVENLABS_API_KEY")
        if api_key:
            os.environ["ELEVEN_API_KEY"] = api_key
            try:
                from livekit.plugins import elevenlabs
                logger.info("tts_provider_selected", provider="elevenlabs")
                return elevenlabs.TTS(voice_id="21m00Tcm4TlvDq8ikWAM")
            except Exception as exc:
                logger.warning("elevenlabs_init_failed", error=str(exc))

    if provider == "openai" or provider != "elevenlabs":
        try:
            from livekit.plugins import openai
            voice = os.environ.get("TTS_VOICE", "alloy")
            model = os.environ.get("TTS_MODEL", "gpt-4o-mini-tts")
            logger.info("tts_provider_selected", provider="openai", voice=voice, model=model)
            return openai.TTS(voice=voice, model=model)
        except Exception as exc:
            logger.warning("openai_tts_init_failed", error=str(exc))

    # Final fallback: Google Cloud TTS
    from livekit.plugins import google
    logger.info("tts_provider_selected", provider="google")
    return google.TTS(gender="female", voice_name="en-US-Wavenet-F")
