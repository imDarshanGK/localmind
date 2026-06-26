import asyncio
import logging
from functools import wraps
import httpx

logger = logging.getLogger(__name__)

def with_retry(max_attempts: int = 3, initial_backoff: float = 1.0):
    """
    Async decorator that retries transient network or HTTP errors with exponential backoff.
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            actual_max_attempts = max(1, max_attempts)
            attempt = 1
            backoff = initial_backoff

            while attempt <= actual_max_attempts:
                try:
                    return await func(*args, **kwargs)
                except httpx.RequestError as e:
                    is_transient = True
                    error_msg = f"Network Error: {type(e).__name__}"
                    last_exc = e
                except httpx.HTTPStatusError as e:
                    # Retry on 408 (Request Timeout), 429 (Too Many Requests), 500, 502, 503, 504
                    if e.response.status_code in (408, 429, 500, 502, 503, 504):
                        is_transient = True
                        error_msg = f"HTTP {e.response.status_code}"
                        last_exc = e
                    else:
                        # Non-transient error (e.g. 400 Bad Request, 404 Not Found)
                        raise
                except Exception:
                    # Non-httpx exception
                    raise

                if is_transient:
                    if attempt == actual_max_attempts:
                        logger.error(f"Action '{func.__name__}' failed after {actual_max_attempts} attempts. Last error: {error_msg}")
                        raise last_exc
                    
                    logger.warning(f"Action '{func.__name__}' failed ({error_msg}). Retrying in {backoff}s... (Attempt {attempt}/{actual_max_attempts})")
                    await asyncio.sleep(backoff)
                    attempt += 1
                    backoff *= 2 # Exponential backoff

        return wrapper
    return decorator
