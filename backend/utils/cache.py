import time
import logging
from typing import Any

logger = logging.getLogger(__name__)

class TTLCache:
    """
    A simple thread-safe, in-memory cache with Time-To-Live (TTL) expiration.
    Used to reduce redundant requests for relatively static data (like model metadata).
    """
    def __init__(self, ttl_seconds: int = 300):
        self.ttl_seconds = ttl_seconds
        self._cache = {}

    def get(self, key: str):
        """Returns the cached value if it exists and hasn't expired, otherwise None."""
        if key in self._cache:
            value, timestamp = self._cache[key]
            if time.time() - timestamp < self.ttl_seconds:
                logger.info(f"CACHE HIT: {key}")
                return value
            else:
                logger.info(f"CACHE EXPIRED: {key}")
                del self._cache[key]
        
        logger.info(f"CACHE MISS: {key}")
        return None

    def set(self, key: str, value: Any):
        """Sets a value in the cache with the current timestamp."""
        logger.info(f"CACHE SET: {key} (TTL: {self.ttl_seconds}s)")
        self._cache[key] = (value, time.time())

    def clear(self):
        """Clears all entries from the cache."""
        self._cache.clear()
