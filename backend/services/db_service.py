"""
Database Service — SQLite (fully local, no external DB needed)
Handles: sessions, messages, documents, settings, plugins log
"""

import sqlite3
import json
import os
from contextlib import contextmanager
import uuid
import time
from sqlite3 import OperationalError
import grapheme

# ------------------------Vacuum Scheduling--------------------------------------------------------
VACUUM_THRESHOLD = int(os.getenv("DB_VACUUM_THRESHOLD", "500"))

def _get_deleted_counter(conn) -> int:
    row = conn.execute(
        "SELECT value FROM app_settings WHERE key = 'rows_deleted_since_vacuum'"
    ).fetchone()
    return int(row["value"]) if row else 0

def _increment_deleted_counter(conn,count:int) -> int:
    new_value = _get_deleted_counter(conn) + count
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key,value,updated_at) VALUES (?,?, datetime('now'))",
        ("rows_deleted_since_vacuum", str(new_value)),
    )
    return new_value

def run_vacuum():
    """ Run VACUUM outside any transaction to reclaim disk space."""
    conn = sqlite3.connect(DB_PATH, timeout=5, isolation_level = None)
    try:
        conn.execute("VACUUM")
        conn.execute(
            "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('rows_deleted_since_vacuum','0',datetime('now'))"
        )
    finally:
        conn.close()

def _maybe_vacuum(deleted_count: int):
    """Track deletions and trigger VACUUM once threshold is crossed."""       
    if deleted_count <= 0:
        return
    with get_db() as conn:
        total = _increment_deleted_counter(conn, deleted_count)
    if total >= VACUUM_THRESHOLD:
        run_vacuum()     



DB_PATH = os.getenv("DB_PATH", "./data/localmind.db")
os.makedirs(os.path.dirname(DB_PATH) if os.path.dirname(DB_PATH) else ".", exist_ok=True)


@contextmanager
def get_db():
    retries = 3
    delay = 0.2

    conn = None

    for attempt in range(retries):
        try:
            conn = sqlite3.connect(DB_PATH, timeout=5)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA foreign_keys=ON")
            break

        except OperationalError as e:
            if "locked" in str(e).lower() and attempt < retries - 1:
                time.sleep(delay)
                continue
            raise

    try:
        yield conn
        conn.commit()

    except OperationalError as e:
        if "locked" in str(e).lower():
            conn.rollback()
            raise RuntimeError(
                "Database is busy. Please try again in a moment."
            ) from e
        conn.rollback()
        raise

    except Exception:
        conn.rollback()
        raise

    finally:
        if conn:
            conn.close()

def init_db():
    """Create all tables on startup."""
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                title TEXT DEFAULT 'New Chat',
                model TEXT DEFAULT 'llama3',
                language TEXT DEFAULT 'en',
                message_count INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
                content TEXT NOT NULL,
                sources TEXT DEFAULT '[]',
                created_at TEXT DEFAULT (datetime('now')),
                benchmarks TEXT DEFAULT '{}',
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );
                           
            CREATE TABLE IF NOT EXISTS message_reactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id INTEGER NOT NULL,
                emoji TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
                UNIQUE(message_id, emoji)
            );

            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                file_size_kb REAL DEFAULT 0,
                chunks_indexed INTEGER DEFAULT 0,
                status TEXT DEFAULT 'completed',
                uploaded_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS plugin_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                plugin TEXT NOT NULL,
                input TEXT,
                output TEXT,
                success INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now'))
            );
                            
            CREATE TABLE IF NOT EXISTS shared_sessions (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                title TEXT NOT NULL,
                model TEXT NOT NULL,
                snapshot_json TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS prompt_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                prompt TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );

            INSERT OR IGNORE INTO app_settings (key, value) VALUES
                ('default_model', '"llama3"'),
                ('default_language', '"en"'),
                ('temperature', '0.7'),
                ('max_history_turns', '10'),
                ('rag_top_k', '4'),
                ('theme', '"dark"'),
                ('embedding_provider', '"sentence-transformers"'),
                ('embedding_model', '"all-MiniLM-L6-v2"'),
                ('rows_deleted_since_vacuum', '0');

        """)
        try:
            conn.execute("ALTER TABLE documents ADD COLUMN status TEXT DEFAULT 'completed'")
        except sqlite3.OperationalError:
            pass  # column already exists

        cols = [row[1] for row in conn.execute("PRAGMA table_info(messages)").fetchall()]
        if "benchmarks" not in cols:
            conn.execute("ALTER TABLE messages ADD COLUMN benchmarks TEXT DEFAULT '{}'")

        cols_sessions = [row[1] for row in conn.execute("PRAGMA table_info(sessions)").fetchall()]
        if "language" not in cols_sessions:
            conn.execute("ALTER TABLE sessions ADD COLUMN language TEXT DEFAULT 'en'")
# ─── Sessions ────────────────────────────────────────────────
def create_session(session_id: str, title: str = "New Chat", model: str = "llama3", language: str = "en") -> dict:
    with get_db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO sessions (id, title, model, language) VALUES (?, ?, ?, ?)",
            (session_id, title, model, language),
        )
    return get_session(session_id)


def get_session(session_id: str) -> dict | None:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM sessions WHERE id=?", (session_id,)).fetchone()
        return dict(row) if row else None


def update_session(session_id: str, title: str = None, model: str = None, language: str = None):
    with get_db() as conn:
        if title is not None:
            conn.execute("UPDATE sessions SET title=?, updated_at=datetime('now') WHERE id=?", (title, session_id))
        if model is not None:
            conn.execute("UPDATE sessions SET model=?, updated_at=datetime('now') WHERE id=?", (model, session_id))
        if language is not None:
            conn.execute("UPDATE sessions SET language=?, updated_at=datetime('now') WHERE id=?", (language, session_id))


def delete_session(session_id: str):
    """Deletes a session, clears its physical document assets from disk, and removes database rows."""
    with get_db() as conn:
        # 1. Fetch all physical file paths for documents bound to this session
        rows = conn.execute("SELECT file_path FROM documents WHERE session_id=?", (session_id,)).fetchall()
        for row in rows:
            if row["file_path"]:
                physical_path = row["file_path"]
                try:
                    if os.path.exists(physical_path) and os.path.isfile(physical_path):
                        os.remove(physical_path)
                        print(f"Cleaned up session document asset: {physical_path}")
                except Exception as file_err:
                    print(f"Warning: Failed to delete session asset {physical_path}: {str(file_err)}")

        # 2. Gather counts for vacuum scheduling metric tracking
        msg_count = conn.execute(
            "SELECT COUNT(*) FROM messages WHERE session_id=?", (session_id,)
        ).fetchone()[0]
        doc_count = len(rows)

        # 3. Delete the session row (triggers cascading drops on remaining dependent rows)
        cur = conn.execute("DELETE FROM sessions WHERE id=?", (session_id,))
        deleted = cur.rowcount + msg_count + doc_count

    _maybe_vacuum(deleted)   


def clear_all_sessions():
    with get_db() as conn:
        conn.execute("DELETE FROM messages")
        conn.execute("DELETE FROM sessions")


def get_all_sessions() -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM sessions ORDER BY updated_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]


# ─── Messages ────────────────────────────────────────────────
# ─── Message Reactions ───────────────────────────────────────────────────────
def toggle_message_reaction(message_id: int, emoji: str) -> str:
    """
    Toggles an emoji reaction on a message.
    If the reaction exists, it is removed. If it does not, it is added.
    Returns 'added' or 'removed'.
    """
    with get_db() as conn:
        # Check if this specific emoji reaction already exists for this message
        row = conn.execute(
            "SELECT id FROM message_reactions WHERE message_id = ? AND emoji = ?",
            (message_id, emoji)
        ).fetchone()

        if row:
            conn.execute("DELETE FROM message_reactions WHERE id = ?", (row["id"],))
            return "removed"
        else:
            conn.execute(
                "INSERT INTO message_reactions (message_id, emoji) VALUES (?, ?)",
                (message_id, emoji)
            )
            return "added"


def get_reactions_for_message(message_id: int) -> list[str]:
    """Fetches all unique emoji strings applied to a message."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT emoji FROM message_reactions WHERE message_id = ? ORDER BY created_at ASC",
            (message_id,)
        ).fetchall()
        return [r["emoji"] for r in rows]


def get_session_reactions_map(session_id: str) -> dict[int, list[str]]:
    """
    Fetches all reactions for all messages in a session at once.
    Returns a dictionary mapping message_id -> list of emojis.
    """
    with get_db() as conn:
        rows = conn.execute("""
            SELECT r.message_id, r.emoji 
            FROM message_reactions r
            JOIN messages m ON r.message_id = m.id
            WHERE m.session_id = ?
            ORDER BY r.created_at ASC
        """, (session_id,)).fetchall()
        
        reactions_map = {}
        for r in rows:
            msg_id = r["message_id"]
            if msg_id not in reactions_map:
                reactions_map[msg_id] = []
            reactions_map[msg_id].append(r["emoji"])
        return reactions_map
def save_message(session_id: str, role: str, content: str, sources: list = None, benchmarks: dict = None):
    sources = sources or []
    with get_db() as conn:
        conn.execute(
            "INSERT INTO messages (session_id, role, content, sources, benchmarks) VALUES (?,?,?,?,?)",
            (session_id, role, content, json.dumps(sources), json.dumps(benchmarks)),
        )
        conn.execute(
            "UPDATE sessions SET updated_at=datetime('now'), message_count=message_count+1 WHERE id=?",
            (session_id,),
        )
        # Auto-title session from first user message
        if role == "user":
            row = conn.execute(
                "SELECT title FROM sessions WHERE id=?", (session_id,)
            ).fetchone()
            if row and row["title"] == "New Chat":
                if grapheme.length(content) > 40:
                    title = grapheme.slice(content, start=0, end=40) + "..."
                else:
                    title = content
                conn.execute("UPDATE sessions SET title=? WHERE id=?", (title, session_id))


def get_history(session_id: str, limit: int = 20) -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT role, content FROM messages WHERE session_id=? ORDER BY created_at ASC LIMIT ?",
            (session_id, limit),
        ).fetchall()
        return [{"role": r["role"], "content": r["content"]} for r in rows]


def get_messages_full(session_id: str) -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, role, content, sources, created_at, benchmarks FROM messages WHERE session_id=? ORDER BY created_at ASC",
            (session_id,),
        ).fetchall()
        return [
            {
                "id": r["id"],
                "role": r["role"],
                "content": r["content"],
                "sources": json.loads(r["sources"] or "[]"),
                "created_at": r["created_at"],
                "benchmarks": json.loads(r["benchmarks"] or {})
            }
            for r in rows
        ]


def clear_messages(session_id: str):
    with get_db() as conn:
        cur = conn.execute("DELETE FROM messages WHERE session_id=?", (session_id,))
        deleted = cur.rowcount
        conn.execute("UPDATE sessions SET message_count=0 WHERE id=?", (session_id,))
    _maybe_vacuum(deleted)    


def delete_message(session_id: str, message_id: int) -> int:
    """Delete a single message from a session.

    Returns the number of rows deleted (0 if the message does not exist in this
    session). The delete is scoped by session_id so a message can only be
    removed from its own thread.
    """
    with get_db() as conn:
        cur = conn.execute(
            "DELETE FROM messages WHERE id=? AND session_id=?",
            (message_id, session_id),
        )
        deleted = cur.rowcount
        if deleted:
            conn.execute(
                "UPDATE sessions SET message_count=MAX(message_count - ?, 0), updated_at=datetime('now') WHERE id=?",
                (deleted, session_id),
            )
        return deleted


# ─── Documents ───────────────────────────────────────────────
def save_document(session_id: str, filename: str, file_path: str, chunks: int, size_kb: float, status: str = "completed") -> int:
    with get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO documents (session_id, filename, file_path, chunks_indexed, file_size_kb, status) VALUES (?,?,?,?,?,?)",
            (session_id, filename, file_path, chunks, size_kb, status),
        )
        return cursor.lastrowid

def update_document_status(doc_id: int, status: str, chunks_indexed: int = None):
    with get_db() as conn:
        if chunks_indexed is not None:
            conn.execute("UPDATE documents SET status=?, chunks_indexed=? WHERE id=?", (status, chunks_indexed, doc_id))
        else:
            conn.execute("UPDATE documents SET status=? WHERE id=?", (status, doc_id))


def get_documents(session_id: str) -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM documents WHERE session_id=? ORDER BY uploaded_at DESC",
            (session_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def delete_document(doc_id: int):
    """Deletes the physical uploaded file from disk and removes its record entry from SQLite."""
    with get_db() as conn:
        # 1. Fetch the physical file path before deleting the database reference row
        row = conn.execute("SELECT file_path FROM documents WHERE id=?", (doc_id,)).fetchone()
        
        if row and row["file_path"]:
            physical_path = row["file_path"]
            try:
                # 2. Check if the file exists on the filesystem and wipe it out
                if os.path.exists(physical_path) and os.path.isfile(physical_path):
                    os.remove(physical_path)
                    print(f"Successfully deleted physical file asset: {physical_path}")
            except Exception as file_err:
                # Log the error but continue so the database doesn't lock or desync
                print(f"Warning: Failed to clean up disk file {physical_path}: {str(file_err)}")

        # 3. Clean up the database record entries
        cur = conn.execute("DELETE FROM documents WHERE id=?", (doc_id,))
        deleted = cur.rowcount
        
    _maybe_vacuum(deleted)    

# ─── Settings ────────────────────────────────────────────────
def get_settings() -> dict:
    with get_db() as conn:
        rows = conn.execute("SELECT key, value FROM app_settings").fetchall()
        return {r["key"]: json.loads(r["value"]) for r in rows}


def save_setting(key: str, value):
    with get_db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))",
            (key, json.dumps(value)),
        )


# ─── Plugin logs ─────────────────────────────────────────────

def get_plugin_logs(limit: int = 50) -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM plugin_logs ORDER BY created_at DESC LIMIT ?",
            (limit,)
        ).fetchall()
        return [dict(r) for r in rows]

def log_plugin(session_id: str, plugin: str, inp: str, out: str, success: bool = True):
    with get_db() as conn:
        conn.execute(
            "INSERT INTO plugin_logs (session_id, plugin, input, output, success) VALUES (?,?,?,?,?)",
            (session_id, plugin, inp, out, int(success)),
        )


# ─── Shareable Sessions (Issue #270) ─────────────────────────

def create_shared_session(session_id: str) -> str:
    """
    Captures a frozen snapshot of a chat session's history 
    and returns a unique, obfuscated sharing ID string.
    """
    # 1. Fetch current session parameters
    session = get_session(session_id)
    if not session:
        raise ValueError("Session not found")

    # 2. Extract full historical messages bundled with sources and timelines
    messages = get_messages_full(session_id)

    # 3. Generate a secure, un-guessable sharing string key
    share_id = str(uuid.uuid4())

    # 4. Serialize messages list into a clean snapshot string
    snapshot_str = json.dumps(messages)

    # 5. Commit snapshot configuration records into the DB
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO shared_sessions (id, session_id, title, model, snapshot_json)
            VALUES (?, ?, ?, ?, ?)
            """,
            (share_id, session_id, session["title"], session["model"], snapshot_str)
        )
    return share_id


def get_shared_session(share_id: str) -> dict | None:
    """
    Retrieves a shared session snapshot record and unpacks its historical arrays.
    """
    with get_db() as conn:
        row = conn.execute(
            "SELECT title, model, snapshot_json, created_at FROM shared_sessions WHERE id = ?",
            (share_id,)
        )
        row = row.fetchone()

    if not row:
        return None

    return {
        "id": share_id,
        "title": row["title"],
        "model": row["model"],
        "messages": json.loads(row["snapshot_json"]),  # Turn string array back into live json dicts
        "created_at": row["created_at"]
    }
# ─── Prompt Templates (Updated Signatures) ───────────────────

def create_prompt_template(prompt_title: str, prompt: str) -> dict:
    with get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO prompt_templates (name, prompt) VALUES (?, ?)",
            (prompt_title, prompt)
        )
        template_id = cursor.lastrowid
    return get_prompt_template(template_id)


def get_prompt_template(template_id: int) -> dict | None:
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, name AS prompt_title, prompt, created_at FROM prompt_templates WHERE id = ?", 
            (template_id,)
        ).fetchone()
        return dict(row) if row else None


def get_all_prompt_templates() -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, name AS prompt_title, prompt, created_at FROM prompt_templates ORDER BY created_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]


def update_prompt_template(template_id: int, prompt_title: str = None, prompt: str = None) -> dict | None:
    with get_db() as conn:
        if prompt_title:
            conn.execute("UPDATE prompt_templates SET name=? WHERE id=?", (prompt_title, template_id))
        if prompt:
            conn.execute("UPDATE prompt_templates SET prompt=? WHERE id=?", (prompt, template_id))
    return get_prompt_template(template_id)


def delete_prompt_template(template_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM prompt_templates WHERE id=?", (template_id,))
