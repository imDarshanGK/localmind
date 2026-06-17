"""Export routes — /api/export — export chats as MD, JSON, TXT"""

import json
from datetime import datetime
from typing import List
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from models.schemas import ExportFormat
from services import db_service

router = APIRouter()

MARKDOWN_SEPARATOR = "\n\n---\n\n"


class ExportMessagesRequest(BaseModel):
    message_ids: List[str]
    format: ExportFormat


def _format_markdown_export(
    title: str, exported_at: str, messages: list[dict], model: str | None = None
) -> str:
    metadata = f"*Exported: {exported_at}"
    if model:
        metadata += f" | Model: {model}"
    metadata += "*"

    sections = [f"# {title}\n\n{metadata}"]
    for message in messages:
        role_label = "**You**" if message["role"] == "user" else "**LocalMind**"
        section = f"{role_label}\n\n{message['content']}"
        sources = _format_markdown_sources(message.get("sources"))
        if sources:
            section += f"\n\n*Sources: {sources}*"
        sections.append(section)

    return MARKDOWN_SEPARATOR.join(sections)


def _format_markdown_sources(sources: object) -> str | None:
    if not sources:
        return None

    if isinstance(sources, str):
        try:
            sources = json.loads(sources)
        except json.JSONDecodeError:
            sources = [sources]

    if not sources:
        return None

    return ", ".join(sources)


@router.get("/{session_id}/{fmt}")
async def export_session(session_id: str, fmt: ExportFormat):
    session = db_service.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    messages = db_service.get_messages_full(session_id)
    title = session.get("title", "LocalMind Chat")
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")

    if fmt == ExportFormat.json:
        content = json.dumps(
            {"session": session, "messages": messages, "exported_at": ts},
            indent=2,
            ensure_ascii=False,
        )
        media = "application/json"
        filename = f"localmind_{session_id[:8]}.json"

    elif fmt == ExportFormat.markdown:
        content = _format_markdown_export(
            title, ts, messages, session.get("model", "?")
        )
        media = "text/markdown"
        filename = f"localmind_{session_id[:8]}.md"

    else:  # txt
        lines = [f"LocalMind Export — {title}", f"Exported: {ts}", "=" * 50, ""]
        for m in messages:
            role = "YOU" if m["role"] == "user" else "LOCALMIND"
            lines += [f"[{role}]", m["content"], ""]
        content = "\n".join(lines)
        media = "text/plain"
        filename = f"localmind_{session_id[:8]}.txt"

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
