import sqlite3


from backend.services.db_service import get_db


def test_get_db_retries_locked(monkeypatch):
    calls = {"count": 0}
    real_connect = sqlite3.connect

    def flaky_connect(*args, **kwargs):
        calls["count"] += 1
        if calls["count"] == 1:
            raise sqlite3.OperationalError("database is locked")
        return real_connect(":memory:")

    monkeypatch.setattr(sqlite3, "connect", flaky_connect)

    with get_db() as conn:
        assert conn is not None

    assert calls["count"] == 2