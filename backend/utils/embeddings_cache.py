"""Embeddings cache — pure-Python text→vector cache with TTL + LRU evict.

RAG pipelines repeat embeddings for identical chunks (warmup runs, re-
embedding after chunk-size tweaks, retrieval-time-during-query). Without
a cache every duplicate chunk pays the sentence-transformer CPU cost.

This module supplies a zero-dependency in-memory cache:

- key:   SHA256(text) hex digest, so the dict key length is fixed at 64
         chars regardless of input text length (avoids pathological
         memory blow-up for very long chunks).
- value: (vector, insert_time, last_access_time)
- policy: TTL eviction (default 1h) + optional LRU size cap. Both
         checks happen at read time (lazy), with `prune()` for callers
         that want deterministic sweep.
- thread-safe via a single RLock guarding mutation; reads use the lock
         briefly to update LRU bookkeeping.

The cache is **separate** from rag_service.py's chromadb vector store.
It sits in front of the embedder; rag_service would call `cache.get(text)`
before invoking `embedder.encode(text)` for query-side re-embeds.
Query-side caches are particularly effective because user follow-ups
often share keyword prefixes.

No external deps (no numpy, no sentence-transformers imported here) so
the unit tests can run standalone.
"""

from __future__ import annotations

import hashlib
import logging
import threading
import time
from collections import OrderedDict
from typing import Any, Callable

logger = logging.getLogger(__name__)


DEFAULT_TTL_SECONDS = 3600  # 1 hour
DEFAULT_MAX_ENTRIES = 1024  # plenty for a single chat session


def _hash_key(text: Any) -> str:
    """Return a deterministic 64-char SHA256 hex digest of the input.

    The key is \"emb:\"-prefixed so it's clear which namespace owns the
    slot when a downstream cache dump is inspected.
    """
    if text is None:
        return "emb:" + hashlib.sha256(b"").hexdigest()
    s = text if isinstance(text, str) else str(text)
    return "emb:" + hashlib.sha256(s.encode("utf-8")).hexdigest()


class EmbeddingsCache:
    """In-memory embeddings cache: TTL + (optional) LRU eviction.

    Construction:
        cache = EmbeddingsCache(ttl_seconds=3600, max_entries=1024)

    Read path:
        vec = cache.get(text)
        if vec is not None:
            return vec            # hit
        vec = embedder.encode(text)
        cache.set(text, vec)
        return vec

    Metrics:
        stats = cache.stats()   # {hits, misses, evictions, size}

    The class deliberately keeps zero external dependencies — it accepts
    any opaque vector type (list, numpy.ndarray, torch.Tensor, plain
    dict) because vectors are stored and returned as-is.
    """

    def __init__(
        self,
        ttl_seconds: int = DEFAULT_TTL_SECONDS,
        max_entries: int | None = DEFAULT_MAX_ENTRIES,
        clock: Callable[[], float] | None = None,
    ):
        if ttl_seconds < 0:
            raise ValueError("ttl_seconds must be >= 0")
        if max_entries is not None and max_entries < 1:
            raise ValueError("max_entries must be >= 1 or None for unbounded")

        self.ttl_seconds = ttl_seconds
        self.max_entries = max_entries
        self._clock = clock or time.time
        self._lock = threading.RLock()
        # OrderedDict preserves insertion order; we move-to-end on
        # access for LRU semantics. Value shape:
        #   (vector, insert_time, last_access_time)
        self._store: "OrderedDict[str, tuple[Any, float, float]]" = OrderedDict()
        # Counters:
        self._hits = 0
        self._misses = 0
        self._evictions = 0

    # ── public API ────────────────────────────────────────────────

    def get(self, text: Any) -> Any:
        """Return cached vector or None on miss/expired eviction.

        ``None`` is a sentinel for cache miss — callers should not store
        ``None`` as a vector (it's not a legal embedding anyway).
        """
        key = _hash_key(text)
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                self._misses += 1
                return None
            vec, inserted, _last_access = entry
            now = self._clock()
            if now - inserted >= self.ttl_seconds:
                # TTL expired (>= so ttl=0 means stored entries are
                # expired on the very next read — useful for tests and
                # for callers who want "always-fresh" behaviour).
                self._store.pop(key, None)
                self._evictions += 1
                self._misses += 1
                logger.debug("EMB_CACHE TTL expire: %s", key)
                return None
            # Hit — update LRU bookkeeping.
            self._store[key] = (vec, inserted, now)
            self._store.move_to_end(key)
            self._hits += 1
            return vec

    def set(self, text: Any, vector: Any) -> None:
        """Store ``vector`` for ``text``; evicts oldest if over cap."""
        if vector is None:
            # We use None as the miss sentinel; storing one would make
            # ``get`` ambiguous. Skip and log.
            logger.debug("EMB_CACHE refusing to store None vector")
            return
        key = _hash_key(text)
        now = self._clock()
        with self._lock:
            if key in self._store:
                # Update existing — keep original insert time so TTL
                # eviction stays fair.
                original_inserted = self._store[key][1]
                self._store[key] = (vector, original_inserted, now)
                self._store.move_to_end(key)
                return
            self._store[key] = (vector, now, now)
            self._evictions += self._maybe_evict_lru_locked()
            self._evictions += self._maybe_evict_ttl_locked()

    def invalidate(self, text: Any) -> bool:
        """Remove a specific text's cache entry. Returns True if removed."""
        key = _hash_key(text)
        with self._lock:
            existed = key in self._store
            if existed:
                self._store.pop(key, None)
            return existed

    def clear(self) -> int:
        """Drop all entries. Returns count of cleared entries."""
        with self._lock:
            n = len(self._store)
            self._store.clear()
            return n

    def prune(self) -> int:
        """Remove all TTL-expired entries. Returns count pruned.

        Use this for periodic sweep; the lazy eviction at read-time
        handles in-flight entries but stale entries that are never
        re-read linger until prune or eviction.
        """
        with self._lock:
            return self._maybe_evict_ttl_locked()

    def stats(self) -> dict:
        """Return a snapshot of cache counters and current size."""
        with self._lock:
            return {
                "hits": self._hits,
                "misses": self._misses,
                "evictions": self._evictions,
                "size": len(self._store),
                "ttl_seconds": self.ttl_seconds,
                "max_entries": self.max_entries,
            }

    def hit_rate(self) -> float:
        """Return hit-rate in [0, 1]; 0.0 if no reads yet."""
        with self._lock:
            total = self._hits + self._misses
            return self._hits / total if total else 0.0

    def keys(self) -> list[str]:
        """Return a list of the SHA256 keys (NOT the original text)."""
        with self._lock:
            return list(self._store.keys())

    def __contains__(self, text: Any) -> bool:
        key = _hash_key(text)
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return False
            if self._clock() - entry[1] > self.ttl_seconds:
                return False
            return True

    def __len__(self) -> int:
        with self._lock:
            return len(self._store)

    # ── internals (must be called under self._lock) ────────────────

    def _maybe_evict_lru_locked(self) -> int:
        """Evict oldest entries until size <= max_entries.

        Called after an insert. Caller must hold self._lock.
        Returns number of entries evicted."""
        if self.max_entries is None:
            return 0
        evicted = 0
        while len(self._store) > self.max_entries:
            self._store.popitem(last=False)
            evicted += 1
        return evicted

    def _maybe_evict_ttl_locked(self) -> int:
        """Sweep expired entries. Caller must hold self._lock."""
        if self.ttl_seconds <= 0:
            return 0
        now = self._clock()
        to_remove = []
        for key, (_v, inserted, _la) in self._store.items():
            if now - inserted > self.ttl_seconds:
                to_remove.append(key)
        for key in to_remove:
            self._store.pop(key, None)
        return len(to_remove)


def warmup_embeddings(
    cache: EmbeddingsCache,
    texts: list[str],
    embedder: Callable[[str], Any] | None = None,
) -> dict:
    """Populate ``cache`` from a list of texts using ``embedder``.

    Returns a stats dict capturing pre-warm metrics:
      - requested: len(texts)
      - already_cached: skipped because present in cache
      - newly_embedded: actually invoked the embedder
      - failed: embedder raised (safely skipped, error logged)
      - after_warm_stats: cache.stats() snapshot
    """
    requested = len(texts)
    already_cached = 0
    newly_embedded = 0
    failed = 0
    for text in texts:
        if cache.get(text) is not None:
            already_cached += 1
            continue
        if embedder is None:
            # Nothing to embed with — record the miss and move on so
            # callers can stub-test warmup without an embedder.
            cache.set(text, b"")
            newly_embedded += 1
            continue
        try:
            vec = embedder(text)
            cache.set(text, vec)
            newly_embedded += 1
        except Exception as exc:  # noqa: BLE001 — warmup must not crash.
            failed += 1
            logger.warning("EMB_CACHE warmup embed failed: %s", exc)
    return {
        "requested": requested,
        "already_cached": already_cached,
        "newly_embedded": newly_embedded,
        "failed": failed,
        "after_warm_stats": cache.stats(),
    }
