from services.db_service import get_db


def test_db_connection_opens():
    with get_db() as conn:
        result = conn.execute("SELECT 1").fetchone()

    assert result[0] == 1