"""
test_backup.py — Local Backup Verification Test (#310)

Verifies that:
  1. backup_db() creates a non-empty backup file.
  2. restore_db() overwrites the live database with backup data.
  3. All critical records (sessions, messages, settings) survive the round-trip.
  4. Temporary files are cleaned up after the test suite.

Run individually:
    pytest backend/tests/test_backup.py -v
"""

import os
import sqlite3
import uuid

import pytest

import services.db_service as db_service
from services.db_service import (
    backup_db,
    create_session,
    get_messages_full,
    get_session,
    init_db,
    restore_db,
    save_message,
    save_setting,
    get_settings,
)


# ---------------------------------------------------------------------------
# Fixture: isolated temporary database
# ---------------------------------------------------------------------------

@pytest.fixture()
def isolated_db(tmp_path):
    """Point DB_PATH at a fresh temporary database for each test.

    The fixture saves and restores the original DB_PATH so that other tests
    that share the module-level state are not affected.
    """
    original_path = db_service.DB_PATH
    tmp_db = str(tmp_path / "test_localmind.db")
    db_service.DB_PATH = tmp_db
    init_db()

    yield tmp_path  # give the test access to the temp directory

    # Teardown: restore DB_PATH; tmp_path is removed by pytest automatically
    db_service.DB_PATH = original_path


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestBackupCreation:
    """backup_db() produces a valid, non-empty file."""

    def test_backup_file_is_created(self, isolated_db):
        dest = str(isolated_db / "backup.db")
        backup_db(dest)
        assert os.path.exists(dest), "Backup file was not created"

    def test_backup_file_is_nonempty(self, isolated_db):
        dest = str(isolated_db / "backup.db")
        backup_db(dest)
        assert os.path.getsize(dest) > 0, "Backup file is empty"

    def test_backup_creates_parent_dirs(self, isolated_db):
        dest = str(isolated_db / "subdir" / "nested" / "backup.db")
        backup_db(dest)
        assert os.path.exists(dest)

    def test_backup_is_valid_sqlite(self, isolated_db):
        dest = str(isolated_db / "backup.db")
        backup_db(dest)
        # The backup must be a readable SQLite database itself.
        conn = sqlite3.connect(dest)
        try:
            tables = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
            table_names = {t[0] for t in tables}
        finally:
            conn.close()
        assert "sessions" in table_names
        assert "messages" in table_names


class TestRestoreRoundTrip:
    """Data written before backup survives the full backup → clear → restore cycle."""

    def _seed_data(self):
        """Insert a session, two messages, and a custom setting. Returns the session id."""
        sid = str(uuid.uuid4())
        create_session(sid, title="Backup Test Session", model="llama3")
        save_message(sid, "user", "What is LocalMind?")
        save_message(sid, "assistant", "LocalMind is an offline AI assistant.")
        save_setting("backup_test_key", "backup_test_value")
        return sid

    def test_session_is_restored(self, isolated_db):
        sid = self._seed_data()
        backup_path = str(isolated_db / "round_trip.db")

        backup_db(backup_path)

        # Remove the session from the live DB to simulate data loss.
        with db_service.get_db() as conn:
            conn.execute("DELETE FROM sessions WHERE id=?", (sid,))

        assert get_session(sid) is None, "Session should have been deleted before restore"

        restore_db(backup_path)

        restored = get_session(sid)
        assert restored is not None, "Session was not restored"
        assert restored["title"] == "Backup Test Session"
        assert restored["model"] == "llama3"

    def test_message_count_is_restored(self, isolated_db):
        sid = self._seed_data()
        backup_path = str(isolated_db / "round_trip_msgs.db")

        backup_db(backup_path)

        with db_service.get_db() as conn:
            conn.execute("DELETE FROM messages WHERE session_id=?", (sid,))

        msgs_before_restore = get_messages_full(sid)
        assert len(msgs_before_restore) == 0

        restore_db(backup_path)

        msgs = get_messages_full(sid)
        assert len(msgs) == 2, f"Expected 2 messages, got {len(msgs)}"

    def test_message_contents_are_restored(self, isolated_db):
        sid = self._seed_data()
        backup_path = str(isolated_db / "round_trip_content.db")

        backup_db(backup_path)

        with db_service.get_db() as conn:
            conn.execute("DELETE FROM messages WHERE session_id=?", (sid,))

        restore_db(backup_path)

        msgs = get_messages_full(sid)
        contents = [m["content"] for m in msgs]
        assert "What is LocalMind?" in contents
        assert "LocalMind is an offline AI assistant." in contents

    def test_message_roles_are_preserved(self, isolated_db):
        sid = self._seed_data()
        backup_path = str(isolated_db / "round_trip_roles.db")

        backup_db(backup_path)

        with db_service.get_db() as conn:
            conn.execute("DELETE FROM messages WHERE session_id=?", (sid,))

        restore_db(backup_path)

        msgs = get_messages_full(sid)
        roles = [m["role"] for m in msgs]
        assert "user" in roles
        assert "assistant" in roles

    def test_settings_are_restored(self, isolated_db):
        self._seed_data()
        backup_path = str(isolated_db / "round_trip_settings.db")

        backup_db(backup_path)

        with db_service.get_db() as conn:
            conn.execute(
                "DELETE FROM app_settings WHERE key='backup_test_key'"
            )

        restore_db(backup_path)

        settings = get_settings()
        assert "backup_test_key" in settings
        assert settings["backup_test_key"] == "backup_test_value"


class TestErrorHandling:
    """backup_db / restore_db raise meaningful exceptions on failure."""

    def test_restore_missing_file_raises(self, isolated_db):
        with pytest.raises(FileNotFoundError, match="backup file not found"):
            restore_db(str(isolated_db / "nonexistent.db"))

    def test_backup_to_invalid_path_raises(self, isolated_db):
        # Place a plain file where backup_db would need to create a directory.
        # os.makedirs raises an OS-level error which backup_db converts to RuntimeError.
        blocker = isolated_db / "blocker"
        blocker.write_text("I am a file, not a directory")
        # Try to write backup inside that file as if it were a directory.
        invalid_dest = str(blocker / "backup.db")
        with pytest.raises(RuntimeError, match="failed to write backup"):
            backup_db(invalid_dest)
