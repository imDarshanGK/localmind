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

import logging
from urllib.parse import urlparse

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)

# HTTP methods that do NOT change server state — always allowed.
_SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


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


class OriginValidationMiddleware(BaseHTTPMiddleware):
    """
    Reject state-changing requests whose Origin header is present but not in
    the configured allowlist.

    Args:
        allowed_origins: Sequence of allowed origin strings, e.g.
            ["http://localhost:3000", "http://localhost:5173"].
            Typically sourced from the CORS_ORIGINS environment variable so
            that the same list governs both CORS and CSRF checks.
    """

    def __init__(self, app, allowed_origins: list[str]) -> None:
        super().__init__(app)
        # Normalise: strip trailing slashes for reliable comparison.
        self._allowed: frozenset[str] = frozenset(
            o.strip().rstrip("/") for o in allowed_origins
        )

    async def dispatch(self, request: Request, call_next):
        if request.method in _SAFE_METHODS:
            return await call_next(request)

        origin = _origin_from_header(request)

        if origin is None:
            # No Origin / Referer — allow (same-origin or non-browser client).
            return await call_next(request)

        if origin not in self._allowed:
            logger.warning(
                "CSRF check failed: method=%s path=%s origin=%r not in allowlist",
                request.method,
                request.url.path,
                origin,
            )
            return JSONResponse(
                {"detail": "CSRF check failed: origin not allowed"},
                status_code=403,
            )

        return await call_next(request)
