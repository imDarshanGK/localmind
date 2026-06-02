"""LocalMind CLI powered by Typer + Rich."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

import httpx
import typer
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table

app = typer.Typer(help="LocalMind command line client.")
sessions_app = typer.Typer(help="Session management commands.")
app.add_typer(sessions_app, name="sessions")

console = Console()
DEFAULT_BASE_URL = os.getenv("LOCALMIND_API_BASE", "http://127.0.0.1:8000/api").rstrip("/")


def _client(timeout: float = 30.0) -> httpx.Client:
    return httpx.Client(base_url=DEFAULT_BASE_URL, timeout=timeout)


def _request_error_message(resp: httpx.Response) -> str:
    try:
        data = resp.json()
        if isinstance(data, dict):
            return str(data.get("detail") or data.get("message") or resp.text)
    except Exception:
        pass
    return resp.text or f"HTTP {resp.status_code}"


def _ensure_ok(resp: httpx.Response, action: str) -> None:
    if resp.is_success:
        return
    message = _request_error_message(resp)
    raise typer.BadParameter(f"{action} failed ({resp.status_code}): {message}")


def _create_session(title: str, model: str) -> str:
    with _client() as client:
        resp = client.post("/sessions/", json={"title": title, "model": model})
    _ensure_ok(resp, "Create session")
    return resp.json()["id"]


@app.command()
def chat(
    query: str = typer.Argument(..., help="Prompt to send."),
    session_id: Optional[str] = typer.Option(None, "--session-id", "-s", help="Reuse an existing session."),
    model: str = typer.Option("qwen2.5:0.5b", "--model", "-m", help="Model name to use."),
    language: str = typer.Option("en", "--language", "-l", help="Response language code."),
    no_documents: bool = typer.Option(False, "--no-documents", help="Disable RAG document retrieval."),
) -> None:
    """Send a prompt and stream response from FastAPI backend."""
    try:
        sid = session_id or _create_session("CLI Chat", model)
        console.print(f"[bold cyan]Session:[/bold cyan] {sid}")
        payload = {
            "message": query,
            "session_id": sid,
            "model": model,
            "use_documents": not no_documents,
            "language": language,
        }

        with _client(timeout=180.0) as client:
            with client.stream("POST", "/chat/stream", json=payload) as resp:
                _ensure_ok(resp, "Stream chat")
                console.print("[bold green]Assistant:[/bold green] ", end="")
                for line in resp.iter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data = json.loads(line[6:])
                    token = data.get("token")
                    if token:
                        console.print(token, end="")
                    if data.get("done"):
                        sources = data.get("sources") or []
                        if sources:
                            console.print("\n[dim]Sources:[/dim] " + ", ".join(sources))
                        break
                console.print("")
    except httpx.RequestError as exc:
        console.print(f"[bold red]Connection error:[/bold red] {exc}")
        raise typer.Exit(code=1)
    except typer.BadParameter as exc:
        console.print(f"[bold red]{exc}[/bold red]")
        raise typer.Exit(code=1)
    except Exception as exc:
        console.print(f"[bold red]Unexpected error:[/bold red] {exc}")
        raise typer.Exit(code=1)


@app.command()
def upload(
    file: Path = typer.Argument(..., exists=True, file_okay=True, dir_okay=False, readable=True),
    session_id: Optional[str] = typer.Option(None, "--session-id", "-s", help="Target existing session id."),
    model: str = typer.Option("qwen2.5:0.5b", "--model", "-m", help="Model used when creating new session."),
) -> None:
    """Upload and index a file using backend /api/upload endpoint."""
    if not file.is_file():
        console.print(f"[bold red]Not a file:[/bold red] {file}")
        raise typer.Exit(code=1)

    try:
        sid = session_id or _create_session(f"Upload: {file.stem}", model)
        with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), transient=True) as progress:
            progress.add_task(description=f"Uploading {file.name}...", total=None)
            with _client(timeout=300.0) as client:
                with file.open("rb") as f:
                    files = {"file": (file.name, f, "application/octet-stream")}
                    data = {"session_id": sid}
                    resp = client.post("/upload/", files=files, data=data)
                _ensure_ok(resp, "Upload")
                body = resp.json()

        console.print(f"[bold green]Uploaded:[/bold green] {body.get('filename', file.name)}")
        console.print(f"[cyan]Session:[/cyan] {sid}")
        console.print(f"[cyan]Chunks indexed:[/cyan] {body.get('chunks_indexed', 0)}")
        console.print(f"[dim]{body.get('message', '')}[/dim]")
    except httpx.RequestError as exc:
        console.print(f"[bold red]Connection error:[/bold red] {exc}")
        raise typer.Exit(code=1)
    except typer.BadParameter as exc:
        console.print(f"[bold red]{exc}[/bold red]")
        raise typer.Exit(code=1)
    except Exception as exc:
        console.print(f"[bold red]Unexpected error:[/bold red] {exc}")
        raise typer.Exit(code=1)


@sessions_app.command("list")
def sessions_list() -> None:
    """List active and past chat sessions."""
    try:
        with _client() as client:
            with console.status("[bold cyan]Loading sessions...[/bold cyan]"):
                resp = client.get("/sessions/")
            _ensure_ok(resp, "Fetch sessions")
            sessions = resp.json()

        if not sessions:
            console.print("[yellow]No sessions found.[/yellow]")
            return

        table = Table(title="LocalMind Sessions")
        table.add_column("ID", style="cyan", no_wrap=True)
        table.add_column("Title", style="white")
        table.add_column("Model", style="magenta")
        table.add_column("Messages", justify="right")
        table.add_column("Updated", style="dim")

        for s in sessions:
            table.add_row(
                str(s.get("id", "")),
                str(s.get("title", "New Chat")),
                str(s.get("model", "-")),
                str(s.get("message_count", 0)),
                str(s.get("updated_at", "")),
            )
        console.print(table)
    except httpx.RequestError as exc:
        console.print(f"[bold red]Connection error:[/bold red] {exc}")
        raise typer.Exit(code=1)
    except typer.BadParameter as exc:
        console.print(f"[bold red]{exc}[/bold red]")
        raise typer.Exit(code=1)
    except Exception as exc:
        console.print(f"[bold red]Unexpected error:[/bold red] {exc}")
        raise typer.Exit(code=1)


if __name__ == "__main__":
    app()
