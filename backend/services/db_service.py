"""
Database Service — SQLite (fully local, no external DB needed)
Handles: sessions, messages, documents, settings, plugins log
"""

import sqlite3
import json
import os
from contextlib import contextmanager
import time
from sqlite3 import OperationalError

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
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                file_size_kb REAL DEFAULT 0,
                chunks_indexed INTEGER DEFAULT 0,
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

            INSERT OR IGNORE INTO app_settings (key, value) VALUES
                ('default_model', '"llama3"'),
                ('default_language', '"en"'),
                ('temperature', '0.7'),
                ('max_history_turns', '10'),
                ('rag_top_k', '4'),
                ('theme', '"dark"');

            CREATE TABLE IF NOT EXISTS prompt_templates(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                prompt_title TEXT NOT NULL,
                prompt TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );

        """)


# ─── Sessions ────────────────────────────────────────────────
def create_session(session_id: str, title: str = "New Chat", model: str = "llama3") -> dict:
    with get_db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO sessions (id, title, model) VALUES (?, ?, ?)",
            (session_id, title, model),
        )
    return get_session(session_id)


def get_session(session_id: str) -> dict | None:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM sessions WHERE id=?", (session_id,)).fetchone()
        return dict(row) if row else None


def update_session(session_id: str, title: str = None, model: str = None):
    with get_db() as conn:
        if title:
            conn.execute("UPDATE sessions SET title=?, updated_at=datetime('now') WHERE id=?", (title, session_id))
        if model:
            conn.execute("UPDATE sessions SET model=?, updated_at=datetime('now') WHERE id=?", (model, session_id))


def delete_session(session_id: str):
    with get_db() as conn:
        conn.execute("DELETE FROM sessions WHERE id=?", (session_id,))


def get_all_sessions() -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM sessions ORDER BY updated_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]


# ─── Messages ────────────────────────────────────────────────
def save_message(session_id: str, role: str, content: str, sources: list = None):
    sources = sources or []
    with get_db() as conn:
        conn.execute(
            "INSERT INTO messages (session_id, role, content, sources) VALUES (?,?,?,?)",
            (session_id, role, content, json.dumps(sources)),
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
                title = content[:40] + ("..." if len(content) > 40 else "")
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
            "SELECT role, content, sources, created_at FROM messages WHERE session_id=? ORDER BY created_at ASC",
            (session_id,),
        ).fetchall()
        return [
            {
                "role": r["role"],
                "content": r["content"],
                "sources": json.loads(r["sources"] or "[]"),
                "created_at": r["created_at"],
            }
            for r in rows
        ]


def clear_messages(session_id: str):
    with get_db() as conn:
        conn.execute("DELETE FROM messages WHERE session_id=?", (session_id,))
        conn.execute("UPDATE sessions SET message_count=0 WHERE id=?", (session_id,))


# ─── Documents ───────────────────────────────────────────────
def save_document(session_id: str, filename: str, file_path: str, chunks: int, size_kb: float):
    with get_db() as conn:
        conn.execute(
            "INSERT INTO documents (session_id, filename, file_path, chunks_indexed, file_size_kb) VALUES (?,?,?,?,?)",
            (session_id, filename, file_path, chunks, size_kb),
        )


def get_documents(session_id: str) -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM documents WHERE session_id=? ORDER BY uploaded_at DESC",
            (session_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def delete_document(doc_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM documents WHERE id=?", (doc_id,))


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
def log_plugin(session_id: str, plugin: str, inp: str, out: str, success: bool = True):
    with get_db() as conn:
        conn.execute(
            "INSERT INTO plugin_logs (session_id, plugin, input, output, success) VALUES (?,?,?,?,?)",
            (session_id, plugin, inp, out, int(success)),
        )

# ─── Prompt Template Registry ───────────────────────────────────────────────
def create_prompt_template(prompt_title: str, prompt: str) -> dict:
    """Create a new prompt template."""
    with get_db() as conn:
        conn.execute(
            "INSERT INTO prompt_templates (prompt_title, prompt) VALUES (?, ?)",
            (prompt_title, prompt),
        )
        row = conn.execute(
            "SELECT * FROM prompt_templates WHERE id = last_insert_rowid()"
        ).fetchone()
        return dict(row)


def get_all_prompt_templates() -> list[dict]:
    """Fetch all prompt templates."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM prompt_templates ORDER BY created_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]


def get_prompt_template(template_id: int) -> dict | None:
    """Fetch a single prompt template by ID."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM prompt_templates WHERE id = ?", (template_id,)
        ).fetchone()
        return dict(row) if row else None


def update_prompt_template(template_id: int, prompt_title: str = None, prompt: str = None):
    """Update an existing prompt template."""
    with get_db() as conn:
        if prompt_title:
            conn.execute(
                "UPDATE prompt_templates SET prompt_title = ? WHERE id = ?",
                (prompt_title, template_id),
            )
        if prompt:
            conn.execute(
                "UPDATE prompt_templates SET prompt = ? WHERE id = ?",
                (prompt, template_id),
            )


def delete_prompt_template(template_id: int):
    """Delete a prompt template by ID."""
    with get_db() as conn:
        conn.execute("DELETE FROM prompt_templates WHERE id = ?", (template_id,))
