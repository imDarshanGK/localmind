"""
CSRF Protection Middleware — Origin / Referer Validation

Strategy: Verifying Origin with Standard Headers (OWASP recommended).

For every state-changing request (POST, PUT, PATCH, DELETE) the middleware
checks the `Origin` header sent by the browser.  If the header is present
and its value is NOT in the configured allow-list, the request is rejected
with HTTP 403 before it reaches any route handler.

Why missing Origin is allowed:
    - Same-origin browser requests (frontend served by the same FastAPI
      process in production) may omit the Origin header per the Fetch spec.
    - Direct API calls (curl, pytest TestClient) also omit it.
    - Neither of those is a CSRF vector — CSRF requires a *different-origin*
      page to silently trigger the request on behalf of the victim.

Why this is sufficient without cookies / tokens:
    - LocalMind has no cookies and no browser-managed credentials.
    - Browsers MUST include Origin on cross-origin fetch() mutations
      (Fetch spec §3.1).  An attacker page will always reveal itself via a
      non-allowlisted Origin value.

References:
    OWASP CSRF Prevention Cheat Sheet — "Verifying Origin With Standard
    Headers": https://cheatsheetseries.owasp.org/cheatsheets/
    Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
    #verifying-origin-with-standard-headers
"""

import hashlib
import logging
import time
from urllib.parse import urlparse

from prometheus_client import Counter
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from services.db_service import (
    dedupe_delete,
    dedupe_get,
    dedupe_purge_expired,
    dedupe_set_done,
    dedupe_set_processing,
)

logger = logging.getLogger(__name__)

# Prometheus Metrics
CSRF_REQUESTS = Counter(
    "csrf_requests_total",
    "Total number of requests processed by security middleware",
    ["status"],
)
CSRF_REJECTIONS = Counter(
    "csrf_rejections_total",
    "Total number of requests rejected by security middleware",
    ["method", "reason"],
)

# HTTP methods that do NOT change server state — always allowed.
_SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})

# How long (seconds) a completed response is cached for deduplication.
_DEDUPE_WINDOW_SECONDS = 5.0


def compute_request_hash(client_ip: str, method: str, path: str, body: bytes) -> str:
    """Compute a deterministic SHA-256 hash for request deduplication.

    This function is the single source of truth for the hash used by both
    the middleware and tests.  Keeping it public avoids the need for test
    helpers to replicate the signature format.
    """
    signature_base = f"{client_ip}|{method}|{path}|{body.decode('utf-8', 'ignore')}"
    return hashlib.sha256(signature_base.encode()).hexdigest()


def _origin_from_header(request: Request) -> str | None:
    """
    Return the request origin as a bare scheme+host string, or None if the
    origin cannot be determined (same-origin / non-browser request).

    Precedence:
        1. `Origin` header  — set by browsers on cross-origin requests.
        2. `Referer` header — normalised to scheme+host for comparison;
           used as a last resort when Origin is absent but Referer is present
           (e.g. some same-site form submissions in older browsers).
    """
    origin = request.headers.get("origin")
    if origin:
        return origin.strip().rstrip("/")

    referer = request.headers.get("referer", "").strip()
    if referer:
        parsed = urlparse(referer)
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}"

    return None  # absent — treat as same-origin


class SecurityMiddleware(BaseHTTPMiddleware):
    """
    Combines Origin/Referer CSRF validation and SQLite-backed Request
    Deduplication.

    Rejects state-changing requests whose Origin header is present but not in
    the configured allowlist.  Also persists in-flight and completed request
    signatures to ``dedupe_cache`` (SQLite) so that duplicate submissions
    within ``_DEDUPE_WINDOW_SECONDS`` are served from cache rather than
    re-executing the handler.

    **Known Limitations:**
    - Error responses (4xx/5xx) are NOT cached. This ensures clients can retry
      immediately without receiving a replayed failure.
    - Multi-worker deployments (e.g. Gunicorn with multiple workers) are not fully
      supported by the deduplication logic. SQLite WAL is shared, but concurrent
      writes use last-write-wins. This is acceptable for LocalMind's single-user,
      single-worker architecture.
    """

    def __init__(self, app, allowed_origins: list[str]) -> None:
        super().__init__(app)
        # Normalise: strip trailing slashes for reliable comparison.
        self._allowed: frozenset[str] = frozenset(
            o.strip().rstrip("/") for o in allowed_origins
        )

    async def dispatch(self, request: Request, call_next):
        if request.method in _SAFE_METHODS:
            CSRF_REQUESTS.labels(status="skipped_safe_method").inc()
            return await call_next(request)

        # 1. CSRF Origin Validation
        try:
            origin = _origin_from_header(request)

            if origin is not None and origin not in self._allowed:
                logger.warning(
                    "CSRF check failed: method=%s path=%s origin=%r not in allowlist",
                    request.method,
                    request.url.path,
                    origin,
                )
                CSRF_REQUESTS.labels(status="rejected").inc()
                CSRF_REJECTIONS.labels(method=request.method, reason="invalid_origin").inc()
                return JSONResponse(
                    {"detail": "CSRF check failed: origin not allowed"},
                    status_code=403,
                )
        except Exception:
            logger.exception(
                "Failure recovery triggered in security middleware: method=%s path=%s",
                request.method,
                request.url.path,
            )
            CSRF_REQUESTS.labels(status="error").inc()
            return JSONResponse(
                {"detail": "Security verification error: middleware failure recovery triggered"},
                status_code=500,
            )

        # 2. Request Deduplication (SQLite-backed)
        # Safely read the request body to generate a deterministic signature.
        req_body = await request.body()

        # Reset the stream so route handlers can read it.
        _body_returned = False

        async def receive():
            nonlocal _body_returned
            if not _body_returned:
                _body_returned = True
                return {"type": "http.request", "body": req_body, "more_body": False}
            return {"type": "http.request", "body": b"", "more_body": False}

        request._receive = receive

        client_ip = request.client.host if request.client else "127.0.0.1"
        req_hash = compute_request_hash(client_ip, request.method, request.url.path, req_body)

        now = time.time()

        # Remove stale rows from the DB before checking for hits.
        dedupe_purge_expired(now)

        cached = dedupe_get(req_hash, now)
        if cached is not None:
            if cached["status"] == "done":
                # Return the exact cached response from a previously completed request.
                CSRF_REQUESTS.labels(status="deduplicated").inc()
                logger.info(
                    "Deduplicated identical request from %s for %s",
                    client_ip,
                    request.url.path,
                )
                return Response(
                    content=cached["response_body"],
                    status_code=cached["status_code"],
                    headers=cached["headers"],
                )
            else:
                # A request with this exact signature is currently processing.
                CSRF_REQUESTS.labels(status="deduplicated_in_progress").inc()
                return JSONResponse(
                    {"detail": "Duplicate request in progress"}, status_code=409
                )

        # Mark request as in-flight so concurrent duplicates get a 409.
        dedupe_set_processing(req_hash, expires_at=now + _DEDUPE_WINDOW_SECONDS)

        # Proceed with the actual request.
        response = await call_next(request)

        # Consume the response body so we can cache and then reconstruct it.
        # Use b"".join for O(N) accumulation (better than += for large payloads)
        res_body = b"".join([chunk async for chunk in response.body_iterator])

        # Only cache successful responses.
        # Error responses (4xx, 5xx) must NOT be persisted to the 'done' cache:
        # replaying a transient failure to the client would hide a real bug and
        # prevent an immediate retry from succeeding.
        if response.status_code < 400:
            dedupe_set_done(
                req_hash,
                response_body=res_body,
                status_code=response.status_code,
                headers=dict(response.headers),
                expires_at=time.time() + _DEDUPE_WINDOW_SECONDS,
            )
        else:
            # Remove the 'processing' sentinel so the client can retry right away.
            dedupe_delete(req_hash)
            logger.info(
                "Deduplication sentinel cleared for %s %s (status %d — not cached)",
                request.method,
                request.url.path,
                response.status_code,
            )

        # Reconstruct the response since we consumed its body iterator.
        new_response = Response(
            content=res_body,
            status_code=response.status_code,
            headers=dict(response.headers),
            media_type=response.media_type,
        )

        CSRF_REQUESTS.labels(status="allowed").inc()
        return new_response

