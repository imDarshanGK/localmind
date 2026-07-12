"""Export routes — /api/export — export chats as MD, JSON, TXT"""

import json
import re
from datetime import datetime
from typing import List
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, field_validator
from models.schemas import ExportFormat
from services import db_service

router = APIRouter()


def generate_pdf(title: str, subtitle: str, messages: list) -> bytes:
    # Check Whisper status
    whisper_status = "Whisper Engine: Active"
    try:
        import whisper
    except (ImportError, ModuleNotFoundError, TypeError):
        import logging
        logging.getLogger(__name__).warning("Whisper package not found. Falling back to text-only processing for PDF export.")
        whisper_status = "Whisper Engine: Offline (Audio features unavailable)"

    from fpdf import FPDF
    pdf = FPDF()
    pdf.add_page()
    
    title_latin1 = title.encode("latin-1", errors="replace").decode("latin-1")
    pdf.set_font("helvetica", "B", 16)
    pdf.cell(0, 10, title_latin1, new_x="LMARGIN", new_y="NEXT")
    
    sub = f"{subtitle} | {whisper_status}"
    sub_latin1 = sub.encode("latin-1", errors="replace").decode("latin-1")
    pdf.set_font("helvetica", "I", 10)
    pdf.cell(0, 8, sub_latin1, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)
    
    for m in messages:
        role = "YOU" if m["role"] == "user" else "LOCALMIND"
        pdf.set_font("helvetica", "B", 11)
        pdf.cell(0, 6, f"[{role}]", new_x="LMARGIN", new_y="NEXT")
        
        pdf.set_font("helvetica", "", 10)
        content = m["content"].strip()
        content_latin1 = content.encode("latin-1", errors="replace").decode("latin-1")
        pdf.multi_cell(0, 5, content_latin1, new_x="LMARGIN", new_y="NEXT")
        
        if m["role"] == "assistant" and m.get("sources"):
            source_names = []
            for src in m["sources"]:
                if isinstance(src, dict):
                    source_names.append(src.get("source", ""))
                else:
                    source_names.append(str(src))
            source_names = [s for s in source_names if s]
            if source_names:
                pdf.set_font("helvetica", "I", 9)
                pdf.cell(0, 5, f"Sources: {', '.join(source_names)}", new_x="LMARGIN", new_y="NEXT")
        
        pdf.ln(5)
        
    return bytes(pdf.output())


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


# --- Issue #238: Group assistant body and sources tightly together in Markdown helper ---
def export_session_markdown(session: dict, messages: list, ts: str) -> str:
    title = session.get("title", "LocalMind Chat")
    lines = [f"# {title}\n", f"*Exported: {ts} | Model: {session.get('model','?')}*\n\n---\n"]
    for m in messages:
        role_label = "**You**" if m["role"] == "user" else "**LocalMind**"
        msg_block = f"{role_label}\n\n{m['content'].strip()}"
        
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


@router.get("/logs")
async def get_export_logs(limit: int = 50):
    """Fetch recent export logs for the audit UI / backend verification."""
    try:
        logs = db_service.get_export_logs(limit)
        return {"logs": logs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch logs: {str(e)}")


@router.get("/{session_id}/{fmt}")
async def export_session(session_id: str, fmt: ExportFormat):
    import time
    start_time = time.perf_counter()
    success = False
    error_msg = None
    messages_count = 0
    try:
        session = db_service.get_session(session_id)
        if not session:
            error_msg = "Session not found"
            raise HTTPException(404, "Session not found")

        messages = db_service.get_messages_full(session_id)
        messages_count = len(messages)
        title = session.get("title", "LocalMind Chat")
        ts = datetime.now().strftime("%Y-%m-%d %H:%M")

        # FIXED (#83): Clean the title to make it safe for a filename
        safe_title = re.sub(r'[^\w\s-]', '', title).strip().lower()
        safe_title = re.sub(r'[\s-]+', '_', safe_title)
        if not safe_title:
            safe_title = "localmind_chat"

        if fmt == ExportFormat.json:
            content = export_session_json(session, messages, ts).encode("utf-8")
            media = "application/json"
            filename = f"{safe_title}.json"

        elif fmt == ExportFormat.markdown:
            content = export_session_markdown(session, messages, ts).encode("utf-8")
            media = "text/markdown"
            filename = f"{safe_title}.md"

        elif fmt == ExportFormat.pdf:
            content = generate_pdf(title, f"Exported: {ts} | Model: {session.get('model', '?')}", messages)
            media = "application/pdf"
            filename = f"{safe_title}.pdf"

        else:  # txt
            content = export_session_txt(session, messages, ts).encode("utf-8")
            media = "text/plain"
            filename = f"{safe_title}.txt"

        success = True
        return Response(
            content=content,
            media_type=media,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        if not error_msg:
            if isinstance(e, HTTPException):
                error_msg = e.detail
            else:
                error_msg = str(e)
        raise
    finally:
        duration_ms = int((time.perf_counter() - start_time) * 1000)
        details_dict = {
            "success": success,
            "duration_ms": duration_ms,
            "messages_count": messages_count,
            "error": error_msg
        }
        try:
            db_service.log_export(
                session_id=session_id,
                format=fmt.value,
                export_type="single",
                details=json.dumps(details_dict)
            )
        except Exception as log_err:
            import logging
            logging.getLogger(__name__).error(f"Audit log failed: {log_err}")


@router.post("/sessions")
async def export_sessions(req: BulkSessionExportRequest):
    import time
    start_time = time.perf_counter()
    success = False
    error_msg = None
    sessions_count = 0
    try:
        valid_exports = []
        for session_id in req.session_ids:
            session = db_service.get_session(session_id)
            if not session:
                continue
            messages = db_service.get_messages_full(session_id)
            valid_exports.append((session, messages))

        if not valid_exports:
            error_msg = "No valid sessions found for the given IDs"
            raise HTTPException(
                status_code=404,
                detail=error_msg
            )

        sessions_count = len(valid_exports)
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

        success = True
        return Response(
            content=content.encode("utf-8"),
            media_type=media,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        if not error_msg:
            if isinstance(e, HTTPException):
                error_msg = e.detail
            else:
                error_msg = str(e)
        raise
    finally:
        duration_ms = int((time.perf_counter() - start_time) * 1000)
        details_dict = {
            "success": success,
            "duration_ms": duration_ms,
            "sessions_count": sessions_count,
            "error": error_msg
        }
        try:
            db_service.log_export(
                session_id=None,
                format=req.format,
                export_type="bulk",
                details=json.dumps(details_dict)
            )
        except Exception as log_err:
            import logging
            logging.getLogger(__name__).error(f"Audit log failed: {log_err}")


@router.post("/messages")
async def export_messages(req: ExportMessagesRequest):
    import time
    start_time = time.perf_counter()
    success = False
    error_msg = None
    messages_count = 0
    try:
        messages = db_service.get_messages_by_ids(req.message_ids)
        if not messages:
            error_msg = "No messages found for the given IDs"
            raise HTTPException(404, error_msg)

        messages_count = len(messages)
        messages.sort(key=lambda m: m.get("timestamp", ""))
        ts = datetime.now().strftime("%Y-%m-%d %H:%M")

        # FIXED (#83): Use a shared default title format for custom standalone message groups
        safe_title = f"localmind_messages_{ts.replace(' ', '_').replace(':', '-')}"

        if req.format == ExportFormat.json:
            content = json.dumps({"messages": messages, "exported_at": ts}, indent=2, ensure_ascii=False).encode("utf-8")
            media = "application/json"
            filename = f"{safe_title}.json"

        elif req.format == ExportFormat.markdown:
            lines = ["# LocalMind – Exported Messages\n", f"*Exported: {ts}*\n\n---\n"]
            for m in messages:
                role_label = "**You**" if m["role"] == "user" else "**LocalMind**"
                msg_block = f"{role_label}\n\n{m['content'].strip()}"

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

            content = "\n".join(lines).encode("utf-8")
            media = "text/markdown"
            filename = f"{safe_title}.md"

        elif req.format == ExportFormat.pdf:
            content = generate_pdf("LocalMind – Exported Messages", f"Exported: {ts}", messages)
            media = "application/pdf"
            filename = f"{safe_title}.pdf"

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
            content = "\n".join(lines).encode("utf-8")
            media = "text/plain"
            filename = f"{safe_title}.txt"

        success = True
        return Response(
            content=content,
            media_type=media,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        if not error_msg:
            if isinstance(e, HTTPException):
                error_msg = e.detail
            else:
                error_msg = str(e)
        raise
    finally:
        duration_ms = int((time.perf_counter() - start_time) * 1000)
        details_dict = {
            "success": success,
            "duration_ms": duration_ms,
            "messages_count": messages_count,
            "error": error_msg
        }
        try:
            db_service.log_export(
                session_id=None,
                format=req.format.value,
                export_type="messages",
                details=json.dumps(details_dict)
            )
        except Exception as log_err:
            import logging
            logging.getLogger(__name__).error(f"Audit log failed: {log_err}")