"""
Database Service — SQLite chat history (100% local)
"""

import sqlite3
import json
import os
from datetime import datetime
from contextlib import contextmanager

DB_PATH = "./data/localmind.db"
os.makedirs("./data", exist_ok=True)


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    """Create tables if they don't exist."""
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                title TEXT DEFAULT 'New Chat',
                model TEXT DEFAULT 'llama3',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                sources TEXT DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            );

            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                chunks_indexed INTEGER DEFAULT 0,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            );
        """)


def create_session(session_id: str, model: str = "llama3") -> dict:
    with get_db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO sessions (id, model) VALUES (?, ?)",
            (session_id, model),
        )
    return get_session(session_id)


def get_session(session_id: str) -> dict | None:
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM sessions WHERE id = ?", (session_id,)
        ).fetchone()
        return dict(row) if row else None


def save_message(session_id: str, role: str, content: str, sources: list = None):
    sources = sources or []
    with get_db() as conn:
        conn.execute(
            """INSERT INTO messages (session_id, role, content, sources)
               VALUES (?, ?, ?, ?)""",
            (session_id, role, content, json.dumps(sources)),
        )
        conn.execute(
            "UPDATE sessions SET updated_at = ? WHERE id = ?",
            (datetime.now().isoformat(), session_id),
        )


def get_history(session_id: str, limit: int = 20) -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            """SELECT role, content FROM messages
               WHERE session_id = ?
               ORDER BY created_at ASC
               LIMIT ?""",
            (session_id, limit),
        ).fetchall()
        return [{"role": r["role"], "content": r["content"]} for r in rows]


def get_all_sessions() -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM sessions ORDER BY updated_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]


def save_document(session_id: str, filename: str, file_path: str, chunks: int):
    with get_db() as conn:
        conn.execute(
            """INSERT INTO documents (session_id, filename, file_path, chunks_indexed)
               VALUES (?, ?, ?, ?)""",
            (session_id, filename, file_path, chunks),
        )
