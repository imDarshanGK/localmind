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

MARKDOWN_SEPARATOR = "\n\n---\n\n"


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
    return json.dumps(
        {"session": session, "messages": messages, "exported_at": ts},
        indent=2,
        ensure_ascii=False,
    )


def _format_source_names(sources: object) -> str | None:
    if not sources:
        return None

    if isinstance(sources, str):
        try:
            sources = json.loads(sources)
        except json.JSONDecodeError:
            sources = [sources]

    if isinstance(sources, dict):
        sources = [sources]

    source_items = sources if isinstance(sources, list) else [sources]
    source_names = []
    for source in source_items:
        if isinstance(source, dict):
            source_name = source.get("source") or ""
        else:
            source_name = str(source)
        if source_name:
            source_names.append(str(source_name))

    if not source_names:
        return None

    return ", ".join(source_names)


def _format_markdown_export(
    title: str, exported_at: str, messages: list[dict], model: str | None = None
) -> str:
    metadata = f"*Exported: {exported_at}"
    if model:
        metadata += f" | Model: {model}"
    metadata += "*"

    sections = [f"# {title}\n\n{metadata}"]
    for message in messages:
        role_label = "**You**" if message.get("role") == "user" else "**LocalMind**"
        content = str(message.get("content", "")).strip()
        section = f"{role_label}\n\n{content}"
        sources = _format_source_names(message.get("sources"))
        if sources:
            section += f"\n\n*Sources: {sources}*"
        sections.append(section)

    return MARKDOWN_SEPARATOR.join(sections)


def export_session_markdown(session: dict, messages: list, ts: str) -> str:
    title = session.get("title", "LocalMind Chat")
    return _format_markdown_export(title, ts, messages, session.get("model", "?"))


def export_session_txt(session: dict, messages: list, ts: str) -> str:
    title = session.get("title", "LocalMind Chat")
    lines = [f"LocalMind Export — {title}", f"Exported: {ts}", "=" * 50, ""]
    for message in messages:
        role = "YOU" if message.get("role") == "user" else "LOCALMIND"
        content = str(message.get("content", "")).strip()
        msg_block = f"[{role}]\n{content}"

        if message.get("role") == "assistant":
            source_names = _format_source_names(message.get("sources"))
            if source_names:
                msg_block += f"\nSources: {source_names}"

        lines += [msg_block, ""]
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
        filename = f"localmind_messages_{ts.replace(' ', '_').replace(':', '-')}.json"

    elif fmt == ExportFormat.markdown:
        content = export_session_markdown(session, messages, ts)
        media = "text/markdown"
        filename = f"localmind_messages_{ts.replace(' ', '_').replace(':', '-')}.md"

    else:  # txt
        content = export_session_txt(session, messages, ts)
        media = "text/plain"
        filename = f"localmind_messages_{ts.replace(' ', '_').replace(':', '-')}.txt"

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
            detail="No valid sessions found for the given IDs",
        )

    ts = datetime.now().strftime("%Y-%m-%d %H:%M")

    if req.format == "json":
        sessions_data = []
        for session, messages in valid_exports:
            sessions_data.append(
                {
                    "session": session,
                    "messages": messages,
                }
            )
        payload = {
            "exported_at": ts,
            "sessions": sessions_data,
        }
        content = json.dumps(payload, indent=2, ensure_ascii=False)
        media = "application/json"
        ext = "json"

    elif req.format == "markdown":
        session_markdowns = [
            export_session_markdown(session, messages, ts)
            for session, messages in valid_exports
        ]
        content = MARKDOWN_SEPARATOR.join(session_markdowns)
        media = "text/markdown"
        ext = "md"

    else:  # txt
        session_txts = [
            export_session_txt(session, messages, ts)
            for session, messages in valid_exports
        ]
        content = "\n\n==================================================\n\n".join(
            session_txts
        )
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
        content = json.dumps(
            {"messages": messages, "exported_at": ts}, indent=2, ensure_ascii=False
        )
        media = "application/json"
        filename = f"localmind_messages_{ts.replace(' ', '_').replace(':', '-')}.json"

    elif req.format == ExportFormat.markdown:
        content = _format_markdown_export("LocalMind – Exported Messages", ts, messages)
        media = "text/markdown"
        filename = f"localmind_messages_{ts.replace(' ', '_').replace(':', '-')}.md"

    else:
        lines = [
            "LocalMind Export — Selected Messages",
            f"Exported: {ts}",
            "=" * 50,
            "",
        ]
        for message in messages:
            role = "YOU" if message.get("role") == "user" else "LOCALMIND"
            content = str(message.get("content", "")).strip()
            msg_block = f"[{role}]\n{content}"

            if message.get("role") == "assistant":
                source_names = _format_source_names(message.get("sources"))
                if source_names:
                    msg_block += f"\nSources: {source_names}"

            lines += [msg_block, ""]
        content = "\n".join(lines)
        media = "text/plain"
        filename = f"localmind_messages_{ts.replace(' ', '_').replace(':', '-')}.txt"

    return Response(
        content=content.encode("utf-8"),
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
