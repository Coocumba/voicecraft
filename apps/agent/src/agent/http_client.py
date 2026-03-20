"""Process-wide shared httpx.AsyncClient for all outbound HTTP calls.

A single AsyncClient is maintained for the lifetime of the worker process so
httpx can pool TCP connections to the Next.js API. This avoids the overhead of
establishing a new TLS handshake on every STT tool invocation or config fetch.

Usage
-----
    from src.agent.http_client import get_http_client
    import httpx

    resp = await get_http_client().post(url, json=payload, timeout=httpx.Timeout(5.0))

Per-request timeout values must be passed at the call site via the ``timeout``
parameter. Do NOT pass a global timeout to the client constructor — that would
prevent callers from applying operation-specific budgets.

Lifecycle
---------
The client is intentionally never closed — it lives as long as the process.
Callers must NOT call ``client.aclose()`` or use the client as a context manager.
"""

from __future__ import annotations

import httpx

_http_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    """Return the process-wide shared httpx.AsyncClient, creating it on first use.

    Thread-safety: Python's GIL makes the lazy-init assignment atomic for
    CPython. The worst case under concurrent coroutine startup is two clients
    are briefly created; the second assignment wins and the first is garbage
    collected cleanly because httpx.AsyncClient holds no OS-level resources
    until a request is made.
    """
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(
            # No default timeout — every caller must supply one explicitly so
            # operations can set their own budget without blocking each other.
            timeout=None,
            limits=httpx.Limits(
                # Allow up to 50 concurrent connections total, with up to 20
                # kept alive idle. Tune upward if many parallel sessions are
                # expected on a single worker.
                max_connections=50,
                max_keepalive_connections=20,
                # Close idle connections after 30 s to avoid holding sockets
                # open against a Next.js server that may have recycled them.
                keepalive_expiry=30.0,
            ),
        )
    return _http_client
