"""Export routes — /api/export — export chats as MD, JSON, TXT"""

import json
from datetime import datetime
from typing import List
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, field_validator
from models.schemas import ExportFormat
from services import db_service

router = APIRouter()


class ExportMessagesRequest(BaseModel):
    message_ids: List[str]
    format: ExportFormat


class BulkSessionExportRequest(BaseModel):
    session_ids: List[str]
    format: str

    @field_validator("session_ids")
    @classmethod
    def validate_session_ids(cls, v: List[str]) -> List[str]:
        if not v:
            raise ValueError("session_ids list cannot be empty")
        return v

    @field_validator("format")
    @classmethod
    def validate_format(cls, v: str) -> str:
        if v not in ("json", "markdown", "txt"):
            raise ValueError("Unsupported format. Must be 'json', 'markdown', or 'txt'")
        return v


def export_session_json(session: dict, messages: list, ts: str) -> str:
    return json.dumps({"session": session, "messages": messages, "exported_at": ts}, indent=2, ensure_ascii=False)


def export_session_markdown(session: dict, messages: list, ts: str) -> str:
    title = session.get("title", "LocalMind Chat")
    lines = [f"# {title}\n", f"*Exported: {ts} | Model: {session.get('model','?')}*\n\n---\n"]
    for m in messages:
        role_label = "**You**" if m["role"] == "user" else "**LocalMind**"
        lines.append(f"{role_label}\n\n{m['content']}\n")
        if m.get("sources"):
            source_names = []
            for src in m["sources"]:
                if isinstance(src, dict):
                    source_names.append(src.get("source", ""))
                else:
                    source_names.append(str(src))
            source_names = [s for s in source_names if s]
            if source_names:
                lines.append(f"*Sources: {', '.join(source_names)}*\n")
        lines.append("\n---\n")
    return "\n".join(lines)


def export_session_txt(session: dict, messages: list, ts: str) -> str:
    title = session.get("title", "LocalMind Chat")
    lines = [f"LocalMind Export — {title}", f"Exported: {ts}", "=" * 50, ""]
    for m in messages:
        role = "YOU" if m["role"] == "user" else "LOCALMIND"
        lines += [f"[{role}]", m["content"], ""]
    return "\n".join(lines)


@router.get("/{session_id}/{fmt}")
async def export_session(session_id: str, fmt: ExportFormat):
    session = db_service.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    messages = db_service.get_messages_full(session_id)
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")

    if fmt == ExportFormat.json:
        content = export_session_json(session, messages, ts)
        media = "application/json"
        filename = f"localmind_{session_id[:8]}.json"

    elif fmt == ExportFormat.markdown:
        content = export_session_markdown(session, messages, ts)
        media = "text/markdown"
        filename = f"localmind_{session_id[:8]}.md"

    else:  # txt
        content = export_session_txt(session, messages, ts)
        media = "text/plain"
        filename = f"localmind_{session_id[:8]}.txt"

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

    ts = datetime.now().strftime("%Y-%m-%d %H:%M")

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
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")

    if req.format == ExportFormat.json:
        content = json.dumps({"messages": messages, "exported_at": ts}, indent=2, ensure_ascii=False)
        media = "application/json"
        filename = f"localmind_messages_{ts.replace(' ', '_').replace(':', '-')}.json"

    elif req.format == ExportFormat.markdown:
        lines = ["# LocalMind – Exported Messages\n", f"*Exported: {ts}*\n\n---\n"]
        for m in messages:
            role_label = "**You**" if m["role"] == "user" else "**LocalMind**"
            lines.append(f"{role_label}\n\n{m['content']}\n")
            if m.get("sources"):
                lines.append(f"*Sources: {', '.join(m['sources'])}*\n")
            lines.append("\n---\n")
        content = "\n".join(lines)
        media = "text/markdown"
        filename = f"localmind_messages_{ts.replace(' ', '_').replace(':', '-')}.md"

    else:
        lines = ["LocalMind Export — Selected Messages", f"Exported: {ts}", "=" * 50, ""]
        for m in messages:
            role = "YOU" if m["role"] == "user" else "LOCALMIND"
            lines += [f"[{role}]", m["content"], ""]
        content = "\n".join(lines)
        media = "text/plain"
        filename = f"localmind_messages_{ts.replace(' ', '_').replace(':', '-')}.txt"

    return Response(
        content=content.encode("utf-8"),
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )