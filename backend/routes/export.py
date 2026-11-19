"""Export routes — /api/export — export chats as MD, JSON, TXT"""

import json
import re
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from models.schemas import ExportFormat
from pydantic import BaseModel, field_validator
from services import db_service

router = APIRouter()


class ExportMessagesRequest(BaseModel):
    message_ids: list[str]
    format: ExportFormat


class BulkSessionExportRequest(BaseModel):
    session_ids: list[str]
    format: str

    @field_validator("session_ids")
    @classmethod
    def validate_session_ids(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("session_ids list cannot be empty")
        return v

    @field_validator("format")
    @classmethod
    def validate_format(cls, v: str) -> str:
        if v not in ("json", "markdown", "txt"):
            raise ValueError("Unsupported format. Must be 'json', 'markdown', or 'txt'")
        return v


_TABLE_SEPARATOR_RE = re.compile(r"^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$")


def escape_markdown_table_pipes(text: str) -> str:
    """Escape stray pipe characters inside Markdown table cells.

    Only lines that belong to a GFM table (header, separator and body rows)
    are touched. Fenced code blocks and prose are left as-is. A row with more
    cells than the separator declares has its surplus pipes escaped so the
    table keeps its column count instead of breaking apart.
    """
    lines = text.split("\n")
    out: list[str] = []
    in_fence = False
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            out.append(line)
            i += 1
            continue
        is_table_header = (
            not in_fence
            and "|" in line
            and i + 1 < len(lines)
            and "|" in lines[i + 1]
            and _TABLE_SEPARATOR_RE.match(lines[i + 1]) is not None
        )
        if not is_table_header:
            out.append(line)
            i += 1
            continue

        col_count = len(lines[i + 1].strip().strip("|").split("|"))
        out.append(line)
        out.append(lines[i + 1])
        i += 2
        while i < len(lines) and "|" in lines[i] and lines[i].strip() and not lines[i].lstrip().startswith("```"):
            out.append(_escape_row(lines[i], col_count))
            i += 1
    return "\n".join(out)


def _escape_row(row: str, col_count: int) -> str:
    """Escape surplus unescaped pipes in one table row so it has col_count cells."""
    stripped = row.strip()
    leading = stripped.startswith("|")
    trailing = stripped.endswith("|") and len(stripped) > 1
    inner = stripped[1 if leading else 0 : len(stripped) - 1 if trailing else len(stripped)]
    # Split on unescaped pipes only.
    cells = re.split(r"(?<!\\)\|", inner)
    if len(cells) <= col_count:
        return row
    head = cells[: col_count - 1]
    tail = "\\|".join(cells[col_count - 1 :])
    rebuilt = head + [tail]
    result = "| " if leading else ""
    result += " | ".join(c.strip() for c in rebuilt)
    result += " |" if trailing else ""
    return result


def export_session_json(session: dict, messages: list, ts: str) -> str:
    return json.dumps({"session": session, "messages": messages, "exported_at": ts}, indent=2, ensure_ascii=False)


# --- Issue #238: Group assistant body and sources tightly together in Markdown helper ---
def export_session_markdown(session: dict, messages: list, ts: str) -> str:
    title = session.get("title", "LocalMind Chat")
    lines = [f"# {title}\n", f"*Exported: {ts} | Model: {session.get('model','?')}*\n\n---\n"]
    for m in messages:
        role_label = "**You**" if m["role"] == "user" else "**LocalMind**"
        msg_block = f"{role_label}\n\n{escape_markdown_table_pipes(m['content'].strip())}"
        
        if m["role"] == "assistant" and m.get("sources"):
            source_names = []
            for src in m["sources"]:
                if isinstance(src, dict):
                    source_names.append(src.get("source", ""))
                else:
                    source_names.append(str(src))
            source_names = [s for s in source_names if s]
            if source_names:
                msg_block += f"\n\n*Sources: {', '.join(source_names)}*"
                
        lines.append(msg_block + "\n")
        
        # FIXED (#93): Enforce distinct double line breaks padding around separator
        lines.append("\n\n---\n\n")
    return "\n".join(lines)


# --- Issue #238: Group assistant body and sources tightly together in Text helper ---
def export_session_txt(session: dict, messages: list, ts: str) -> str:
    title = session.get("title", "LocalMind Chat")
    lines = [f"LocalMind Export — {title}", f"Exported: {ts}", "=" * 50, ""]
    for m in messages:
        role = "YOU" if m["role"] == "user" else "LOCALMIND"
        msg_block = f"[{role}]\n{m['content'].strip()}"
        
        if m["role"] == "assistant" and m.get("sources"):
            source_names = []
            for src in m["sources"]:
                if isinstance(src, dict):
                    source_names.append(src.get("source", ""))
                else:
                    source_names.append(str(src))
            source_names = [s for s in source_names if s]
            if source_names:
                msg_block += f"\nSources: {', '.join(source_names)}"
                
        lines += [msg_block, ""]
    return "\n".join(lines)


@router.get("/{session_id}/{fmt}")
async def export_session(session_id: str, fmt: ExportFormat):
    session = db_service.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    messages = db_service.get_messages_full(session_id)
    title = session.get("title", "LocalMind Chat")
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")

    # FIXED (#83): Clean the title to make it safe for a filename
    safe_title = re.sub(r'[^\w\s-]', '', title).strip().lower()
    safe_title = re.sub(r'[\s-]+', '_', safe_title)
    if not safe_title:
        safe_title = "localmind_chat"

    if fmt == ExportFormat.json:
        content = export_session_json(session, messages, ts)
        media = "application/json"
        filename = f"{safe_title}.json"

    elif fmt == ExportFormat.markdown:
        content = export_session_markdown(session, messages, ts)
        media = "text/markdown"
        filename = f"{safe_title}.md"

    else:  # txt
        content = export_session_txt(session, messages, ts)
        media = "text/plain"
        filename = f"{safe_title}.txt"

    return Response(
        content=content.encode("utf-8"),
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/sessions")
async def export_sessions(req: BulkSessionExportRequest):
    valid_exports = []
    for session_id in req.session_ids:
        session = db_service.get_session(session_id)
        if not session:
            continue
        messages = db_service.get_messages_full(session_id)
        valid_exports.append((session, messages))

    if not valid_exports:
        raise HTTPException(
            status_code=404,
            detail="No valid sessions found for the given IDs"
        )

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")

    if req.format == "json":
        sessions_data = []
        for session, messages in valid_exports:
            sessions_data.append({
                "session": session,
                "messages": messages
            })
        payload = {
            "exported_at": ts,
            "sessions": sessions_data
        }
        content = json.dumps(payload, indent=2, ensure_ascii=False)
        media = "application/json"
        ext = "json"

    elif req.format == "markdown":
        session_markdowns = [export_session_markdown(session, messages, ts) for session, messages in valid_exports]
        content = "\n\n---\n\n".join(session_markdowns)
        media = "text/markdown"
        ext = "md"

    else:  # txt
        session_txts = [export_session_txt(session, messages, ts) for session, messages in valid_exports]
        content = "\n\n==================================================\n\n".join(session_txts)
        media = "text/plain"
        ext = "txt"

    filename = f"localmind_bulk_export_{ts.replace(' ', '_').replace(':', '-')}.{ext}"

    return Response(
        content=content.encode("utf-8"),
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/messages")
async def export_messages(req: ExportMessagesRequest):
    messages = db_service.get_messages_by_ids(req.message_ids)
    if not messages:
        raise HTTPException(404, "No messages found for the given IDs")

    messages.sort(key=lambda m: m.get("timestamp", ""))
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")

    # FIXED (#83): Use a shared default title format for custom standalone message groups
    safe_title = f"localmind_messages_{ts.replace(' ', '_').replace(':', '-')}"

    if req.format == ExportFormat.json:
        content = json.dumps({"messages": messages, "exported_at": ts}, indent=2, ensure_ascii=False)
        media = "application/json"
        filename = f"{safe_title}.json"

    elif req.format == ExportFormat.markdown:
        lines = ["# LocalMind – Exported Messages\n", f"*Exported: {ts}*\n\n---\n"]
        for m in messages:
            role_label = "**You**" if m["role"] == "user" else "**LocalMind**"
            msg_block = f"{role_label}\n\n{escape_markdown_table_pipes(m['content'].strip())}"

            if m["role"] == "assistant" and m.get("sources"):
                source_names = []
                for src in m["sources"]:
                    if isinstance(src, dict):
                        source_names.append(src.get("source", ""))
                    else:
                        source_names.append(str(src))
                source_names = [s for s in source_names if s]
                if source_names:
                    msg_block += f"\n\n*Sources: {', '.join(source_names)}*"

            lines.append(msg_block + "\n")
            lines.append("\n\n---\n\n")

        content = "\n".join(lines)
        media = "text/markdown"
        filename = f"{safe_title}.md"

    else:
        lines = ["LocalMind Export — Selected Messages", f"Exported: {ts}", "=" * 50, ""]
        for m in messages:
            role = "YOU" if m["role"] == "user" else "LOCALMIND"
            msg_block = f"[{role}]\n{m['content'].strip()}"
            
            if m["role"] == "assistant" and m.get("sources"):
                source_names = []
                for src in m["sources"]:
                    if isinstance(src, dict):
                        source_names.append(src.get("source", ""))
                    else:
                        source_names.append(str(src))
                source_names = [s for s in source_names if s]
                if source_names:
                    msg_block += f"\nSources: {', '.join(source_names)}"
                
            lines += [msg_block, ""]
        content = "\n".join(lines)
        media = "text/plain"
        filename = f"{safe_title}.txt"

    return Response(
        content=content.encode("utf-8"),
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )