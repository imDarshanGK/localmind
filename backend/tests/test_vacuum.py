from services import db_service
from services.db_service import get_db, _maybe_vacuum, _get_deleted_counter, run_vacuum

def test_deleted_counter_increments():
    with get_db() as conn:
        before = _get_deleted_counter(conn)

    _maybe_vacuum(3)
    with get_db() as conn:
        after = _get_deleted_counter(conn)

    assert after == before + 3

def test_vacuum_triggers_above_threshold(monkeypatch):
    run_vacuum()

    monkeypatch.setattr(db_service, "VACUUM_THRESHOLD", 5)

    called = {"ran": False}
    monkeypatch.setattr(db_service, "run_vacuum", lambda: called.update(ran=True))

    _maybe_vacuum(2)
    assert called["ran"] is False

    _maybe_vacuum(3)
    assert called["ran"] is True

def test_run_vacuum_resets_counter():
    _maybe_vacuum(10)
    run_vacuum()

    with get_db() as conn:
        count = _get_deleted_counter(conn)

    assert count == 0

def test_run_vacuum_executes_without_error():
    with get_db() as conn:
        result= conn.execute("SELECT 1").fetchone()
    run_vacuum()

    with get_db() as conn:
        result_after = conn.execute("SELECT 1").fetchone()

    assert result[0] == result_after[0] == 1                        