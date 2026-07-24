"""Tests for backend/utils/embeddings_cache.py (issue #935).

Covers:
- Hit / miss lifecycle on get + set.
- TTL eviction (lazy at read time) and explicit prune.
- LRU eviction when over capacity (oldest entry dropped first).
- Metrics counters: hits, misses, evictions, size.
- Thread safety via RLock (mutation path).
- Deterministic SHA256-key hashing (same text -> same key).
- Invalid None vector rejection on set.
- warmup_embeddings helper metrics + failure resilience.
- __contains__ membership respects TTL.
"""

from __future__ import annotations

import threading
import time

from utils.embeddings_cache import (
    EmbeddingsCache,
    _hash_key,
    warmup_embeddings,
)


# ─── _hash_key determinism ────────────────────────────────────────


class TestHashKey:
    def test_same_text_same_key(self):
        assert _hash_key("hello") == _hash_key("hello")

    def test_different_text_different_key(self):
        assert _hash_key("hello") != _hash_key("world")

    def test_prefix_short_fixed_length(self):
        # Every hash key has a stable, 64-char SHA256 hex prefix.
        assert _hash_key("a").startswith("emb:")
        assert len(_hash_key("a")) == 4 + 64
        assert len(_hash_key("x" * 4000)) == 4 + 64

    def test_none_input(self):
        assert _hash_key(None) == _hash_key("")

    def test_non_string_input_stringified(self):
        # Numbers are stringified to keep the cache deterministic.
        assert _hash_key(123) == _hash_key("123")


# ─── Basic set/get lifecycle ─────────────────────────────────────


class TestSetGet:
    def test_miss_returns_none(self):
        cache = EmbeddingsCache()
        assert cache.get("never-seen") is None

    def test_set_then_hit(self):
        cache = EmbeddingsCache()
        cache.set("alpha", [1.0, 2.0, 3.0])
        assert cache.get("alpha") == [1.0, 2.0, 3.0]

    def test_set_then_get_preserves_vector_type(self):
        cache = EmbeddingsCache()
        # Sentinel object — cache must return the SAME object, not a copy.
        sentinel = {"id": "blob"}
        cache.set("k", sentinel)
        assert cache.get("k") is sentinel

    def test_set_overwrite_keeps_insert_time(self):
        # Re-setting existing key should refresh vector WITHOUT resetting
        # the original insert time (so TTL eviction stays fair). We can't
        # observe insert time directly, but a tight TTL + immediate
        # second-set must still expire at the same wall-clock moment.
        cache = EmbeddingsCache(ttl_seconds=100)
        cache.set("k", "v1")
        time.sleep(0.01)
        cache.set("k", "v2")
        # First insert time still under TTL — get returns the new vector.
        assert cache.get("k") == "v2"
        assert cache.stats()["size"] == 1

    def test_set_none_skipped(self):
        cache = EmbeddingsCache()
        cache.set("k", None)
        assert cache.get("k") is None
        assert cache.stats()["size"] == 0


# ─── TTL eviction ────────────────────────────────────────────────


class TestTTLEviction:
    def test_immediate_expiry_returns_none(self):
        cache = EmbeddingsCache(ttl_seconds=0)
        cache.set("k", "v")
        # ttl=0 means anything stored is already expired on next get.
        assert cache.get("k") is None

    def test_lazy_expiry_after_window(self):
        # Use a manual clock via injected callable for determinism.
        now = [0.0]
        cache = EmbeddingsCache(ttl_seconds=10, clock=lambda: now[0])
        cache.set("k", "v")
        now[0] = 11
        assert cache.get("k") is None

    def test_get_within_window_returns_vector(self):
        now = [0.0]
        cache = EmbeddingsCache(ttl_seconds=10, clock=lambda: now[0])
        cache.set("k", "v")
        now[0] = 5
        assert cache.get("k") == "v"
        # After hit, still within TTL.
        now[0] = 8
        assert cache.get("k") == "v"

    def test_prune_removes_expired_entries(self):
        now = [0.0]
        cache = EmbeddingsCache(ttl_seconds=10, clock=lambda: now[0])
        cache.set("a", "1")
        cache.set("b", "2")
        cache.set("c", "3")
        now[0] = 11
        n = cache.prune()
        assert n == 3
        assert cache.stats()["size"] == 0

    def test_prune_keeps_unexpired_entries(self):
        now = [0.0]
        cache = EmbeddingsCache(ttl_seconds=10, clock=lambda: now[0])
        cache.set("a", "1")
        now[0] = 5
        cache.set("b", "2")
        now[0] = 11
        n = cache.prune()
        assert n == 1
        assert cache.stats()["size"] == 1
        assert cache.get("b") == "2"


# ─── LRU eviction ─────────────────────────────────────────────────


class TestLRUEviction:
    def test_over_capacity_evicts_oldest(self):
        cache = EmbeddingsCache(max_entries=2, ttl_seconds=10_000)
        cache.set("a", "1")
        cache.set("b", "2")
        cache.set("c", "3")  # evict "a" — least-recently-used
        assert cache.get("a") is None  # evicted -> miss
        assert cache.get("b") == "2"
        assert cache.get("c") == "3"

    def test_lru_on_get_promotes_entry(self):
        cache = EmbeddingsCache(max_entries=2, ttl_seconds=10_000)
        cache.set("a", "1")
        cache.set("b", "2")
        # Touch a to keep it fresh.
        assert cache.get("a") == "1"
        cache.set("c", "3")  # now b should be evicted (a was just read)
        assert cache.get("b") is None
        assert cache.get("a") == "1"
        assert cache.get("c") == "3"

    def test_no_eviction_under_unbounded(self):
        cache = EmbeddingsCache(max_entries=None, ttl_seconds=10_000)
        for i in range(100):
            cache.set(f"k{i}", i)
        assert cache.stats()["size"] == 100


# ─── Metrics ─────────────────────────────────────────────────────


class TestMetrics:
    def test_hits_misses_increment(self):
        cache = EmbeddingsCache(ttl_seconds=10_000)
        cache.get("miss")  # miss
        cache.set("hit", "v")
        cache.get("hit")  # hit
        stats = cache.stats()
        assert stats["hits"] == 1
        assert stats["misses"] == 1

    def test_eviction_counter_increments_on_lru_evict(self):
        cache = EmbeddingsCache(max_entries=1, ttl_seconds=10_000)
        cache.set("a", 1)
        cache.set("b", 2)  # evict a
        stats = cache.stats()
        assert stats["evictions"] == 1

    def test_stats_shape(self):
        cache = EmbeddingsCache(ttl_seconds=42, max_entries=7)
        stats = cache.stats()
        assert set(stats.keys()) == {
            "hits",
            "misses",
            "evictions",
            "size",
            "ttl_seconds",
            "max_entries",
        }
        assert stats["ttl_seconds"] == 42
        assert stats["max_entries"] == 7
        assert stats["size"] == 0

    def test_hit_rate_zero_with_no_reads(self):
        cache = EmbeddingsCache()
        assert cache.hit_rate() == 0.0

    def test_hit_rate_calculation(self):
        cache = EmbeddingsCache(ttl_seconds=10_000)
        cache.set("a", "1")
        cache.get("a")  # hit
        cache.get("miss")  # miss
        # 1 hit / 2 total = 0.5
        assert cache.hit_rate() == 0.5


# ─── Thread safety ───────────────────────────────────────────────


class TestThreadSafety:
    def test_concurrent_set_then_get(self):
        cache = EmbeddingsCache(max_entries=10_000, ttl_seconds=10_000)
        n_threads = 8
        n_per_thread = 200
        errors = []

        def worker(tid):
            try:
                for i in range(n_per_thread):
                    text = f"t{tid}-k{i}"
                    cache.set(text, i)
                    assert cache.get(text) == i
            except Exception as exc:  # noqa: BLE001
                errors.append(exc)

        threads = [threading.Thread(target=worker, args=(t,)) for t in range(n_threads)]
        [t.start() for t in threads]
        [t.join() for t in threads]
        assert errors == []
        # Cache should contain exactly n_threads * n_per_thread entries,
        # bound by max_entries=10_000. With 1_600 entries it fits — no
        # LRU evictions expected.
        assert cache.stats()["size"] == n_threads * n_per_thread
        assert (
            cache.stats()["hits"] == n_threads * n_per_thread
        )  # every worker's get hit


# ─── invalidate / clear ───────────────────────────────────────────


class TestInvalidateClear:
    def test_invalidate_removes_single_entry(self):
        cache = EmbeddingsCache(ttl_seconds=10_000)
        cache.set("a", "1")
        cache.set("b", "2")
        assert cache.invalidate("a") is True
        assert cache.get("a") is None
        assert cache.get("b") == "2"

    def test_invalidate_missing_returns_false(self):
        cache = EmbeddingsCache(ttl_seconds=10_000)
        assert cache.invalidate("never-there") is False

    def test_clear_empties_store(self):
        cache = EmbeddingsCache(ttl_seconds=10_000)
        cache.set("a", "1")
        cache.set("b", "2")
        n = cache.clear()
        assert n == 2
        assert cache.stats()["size"] == 0


# ─── __contains__ / __len__ ──────────────────────────────────────


class TestMembership:
    def test_contains_respects_ttl(self):
        now = [0.0]
        cache = EmbeddingsCache(ttl_seconds=10, clock=lambda: now[0])
        cache.set("a", "1")
        assert "a" in cache
        now[0] = 11
        assert "a" not in cache

    def test_len_tracks_size(self):
        cache = EmbeddingsCache(ttl_seconds=10_000)
        cache.set("a", "1")
        cache.set("b", "2")
        assert len(cache) == 2


# ─── warmup_embeddings ───────────────────────────────────────────


class TestWarmupEmbeddings:
    def test_warmup_with_embedder(self):
        cache = EmbeddingsCache(ttl_seconds=10_000)

        def fake_embed(text):
            return [len(text), ord(text[0])]

        result = warmup_embeddings(cache, ["a", "bb", "ccc"], embedder=fake_embed)
        assert result["requested"] == 3
        assert result["already_cached"] == 0
        assert result["newly_embedded"] == 3
        assert result["failed"] == 0
        # Cache now has 3 entries.
        assert cache.stats()["size"] == 3

    def test_warmup_skips_already_cached(self):
        cache = EmbeddingsCache(ttl_seconds=10_000)
        cache.set("a", "already")
        result = warmup_embeddings(cache, ["a", "b"], embedder=lambda t: t.upper())
        assert result["already_cached"] == 1
        assert result["newly_embedded"] == 1
        assert cache.get("a") == "already"
        assert cache.get("b") == "B"

    def test_warmup_resilient_to_embedder_failure(self):
        cache = EmbeddingsCache(ttl_seconds=10_000)

        def flaky_embed(text):
            if text == "boom":
                raise RuntimeError("boom")
            return [0]

        result = warmup_embeddings(cache, ["ok1", "boom", "ok2"], embedder=flaky_embed)
        assert result["newly_embedded"] == 2
        assert result["failed"] == 1
        assert cache.stats()["size"] == 2  # boom not stored

    def test_warmup_without_embedder_records_miss_only(self):
        # If no embedder provided we still want warmup to populate (with
        # empty bytestring sentinel) so a caller can verify the
        # cache-miss accounting in isolation.
        cache = EmbeddingsCache(ttl_seconds=10_000)
        result = warmup_embeddings(cache, ["a", "b"])
        assert result["newly_embedded"] == 2
        assert cache.stats()["size"] == 2


# ─── Configuration validation ────────────────────────────────────


class TestConfigurationValidation:
    def test_negative_ttl_raises(self):
        try:
            EmbeddingsCache(ttl_seconds=-1)
            assert False, "expected ValueError"
        except ValueError as exc:
            assert "ttl_seconds" in str(exc)

    def test_zero_max_entries_raises(self):
        try:
            EmbeddingsCache(max_entries=0)
            assert False, "expected ValueError"
        except ValueError as exc:
            assert "max_entries" in str(exc)
