"""Export routes — /api/export — export chats as MD, JSON, TXT"""

import json
from datetime import datetime
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from models.schemas import ExportFormat
from services import db_service

router = APIRouter()


@router.get("/{session_id}/{fmt}")
async def export_session(session_id: str, fmt: ExportFormat):
    session  = db_service.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    messages = db_service.get_messages_full(session_id)
    title    = session.get("title", "LocalMind Chat")
    ts       = datetime.now().strftime("%Y-%m-%d %H:%M")

    if fmt == ExportFormat.json:
        content   = json.dumps({"session": session, "messages": messages, "exported_at": ts}, indent=2, ensure_ascii=False)
        media     = "application/json"
        filename  = f"localmind_{session_id[:8]}.json"

    elif fmt == ExportFormat.markdown:
        lines = [f"# {title}\n", f"*Exported: {ts} | Model: {session.get('model','?')}*\n\n\n---\n\n"]
        for m in messages:
            role_label = "**You**" if m["role"] == "user" else "**LocalMind**"
            lines.append(f"{role_label}\n\n{m['content']}\n")
            if m.get("sources"):
                lines.append(f"*Sources: {', '.join(m['sources'])}*\n")
            lines.append("\n---\n")
        content   = "\n".join(lines)
        media     = "text/markdown"
        filename  = f"localmind_{session_id[:8]}.md"

    else:  # txt
        lines = [f"LocalMind Export — {title}", f"Exported: {ts}", "=" * 50, ""]
        for m in messages:
            role = "YOU" if m["role"] == "user" else "LOCALMIND"
            lines += [f"[{role}]", m["content"], ""]
        content   = "\n".join(lines)
        media     = "text/plain"
        filename  = f"localmind_{session_id[:8]}.txt"

    return Response(
        content=content.encode("utf-8"),
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
