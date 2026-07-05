# CSRF Protection — LocalMind

## Overview

LocalMind protects all state-changing API endpoints against Cross-Site Request
Forgery (CSRF) using **Origin / Referer header validation** — an OWASP
recommended defence for JSON REST APIs.

## Threat Model

CSRF attacks require an attacker's page to silently trigger a state-changing
request on behalf of a victim who is simultaneously logged in to the target
service.

LocalMind is an **offline, single-user tool with no authentication or cookies**.
This significantly reduces the CSRF surface, but a residual risk exists:

| Attack vector | Protected? |
|---|---|
| Malicious internet page → `http://localhost:8000` | ✅ Yes — browser sends `Origin: https://evil.com`; rejected |
| DNS-rebinding (attacker domain → 127.0.0.1) | ✅ Yes — `Origin` still carries the attacker's domain |
| Same-LAN attacker directly calling the API | ⚠️ Out of scope — direct network access, not CSRF |

## Implementation

### Middleware: `backend/middleware/csrf.py`

`OriginValidationMiddleware` wraps every request:

1. **Safe methods** (`GET`, `HEAD`, `OPTIONS`) — always passed through.
2. **Mutating methods** (`POST`, `PUT`, `PATCH`, `DELETE`):
   - If **no `Origin` header** is present → request is allowed.
     *(Same-origin browser requests and direct API clients omit the header
     — neither is a CSRF vector.)*
   - If `Origin` is present and **matches** an entry in `CORS_ORIGINS` → allowed.
   - If `Origin` is present and **does not match** → `HTTP 403` is returned
     before the request reaches any route handler.
3. **`Referer` fallback** — when `Origin` is absent but `Referer` is present,
   the header is normalised to `scheme://host` and checked against the same
   list.

### Integration: `backend/app.py`

```python
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(OriginValidationMiddleware, allowed_origins=cors_origins)
app.add_middleware(CORSMiddleware, ...)
```

The CSRF middleware is registered **between** GZip and CORS so that rejected
requests never receive `Access-Control-Allow-*` headers.

## Configuration

The allowed-origins list is read from the `CORS_ORIGINS` environment variable
(already required for CORS). No additional configuration is needed.

```dotenv
# .env
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173
```

To add a new allowed origin (e.g. a staging URL), append it to `CORS_ORIGINS`.
The CSRF check will automatically pick it up.

## Testing

```bash
# Run all tests including the CSRF suite
pytest backend/tests/ -v

# Run only CSRF tests
pytest backend/tests/test_csrf.py -v
```

### Manual verification

```bash
# Should return 403
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:8000/api/sessions/ \
  -H "Content-Type: application/json" \
  -H "Origin: https://evil.com" \
  -d '{"title":"attack"}'

# Should return 200 (no Origin = direct/same-origin access)
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:8000/api/sessions/ \
  -H "Content-Type: application/json" \
  -d '{"title":"ok"}'
```

## Design Decisions

### Why Origin Validation instead of Double-Submit Cookie?

| | Origin Validation | Double-Submit Cookie |
|---|---|---|
| Lines of code | ~110 | ~210 |
| Frontend changes | None | Yes (3 places) |
| New cookies | None | Yes |
| New dependencies | None | None |
| OWASP listed defence | ✅ | ✅ |

For an application with no cookies and no browser-managed credentials, the
Double-Submit Cookie pattern would introduce a cookie into an architecture
that deliberately has none. Origin validation provides equivalent protection
with half the code and zero frontend impact.

### Why is missing Origin allowed?

Per the [Fetch specification §3.1](https://fetch.spec.whatwg.org/), browsers
omit the `Origin` header on same-origin requests. Blocking missing-Origin
requests would break the application when the frontend is served by the same
FastAPI process (production mode). It would also break direct API access from
`curl` and the `pytest` test client — neither of which is a CSRF attack.

## References

- [OWASP CSRF Prevention Cheat Sheet — Verifying Origin With Standard Headers](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#verifying-origin-with-standard-headers)
- [Fetch Living Standard — §3.1 `Origin` header](https://fetch.spec.whatwg.org/)
