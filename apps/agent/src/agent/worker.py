"""LiveKit voice agent worker — placeholder until real agent is built."""

import sys
import time

import structlog

logger = structlog.get_logger()


def start():
    logger.info("voicecraft agent worker started (placeholder)")
    try:
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        logger.info("agent worker shutting down")
        sys.exit(0)


if __name__ == "__main__":
    start()
