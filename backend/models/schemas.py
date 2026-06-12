"""Pydantic v2 schemas for LocalMind API."""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class MessageRole(str, Enum):
    user = "user"
    assistant = "assistant"
    system = "system"


class ChatMessage(BaseModel):
    role: MessageRole
    content: str
    timestamp: Optional[datetime] = None
    sources: List[str] = []


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=8000)
    session_id: str
    model: str = "llama3"
    use_documents: bool = True
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    language: str = "en"


class ChatResponse(BaseModel):
    reply: str
    session_id: str
    model: str
    sources: List[str] = []
    tokens_used: Optional[int] = None


class UploadResponse(BaseModel):
    filename: str
    status: str
    chunks_indexed: int
    message: str
    file_size_kb: float


class ModelInfo(BaseModel):
    name: str
    size: str
    status: str


class SessionCreate(BaseModel):
    title: str = "New Chat"
    model: str = "llama3"


class SessionUpdate(BaseModel):
    title: Optional[str] = None
    model: Optional[str] = None


class SessionOut(BaseModel):
    id: str
    title: str
    model: str
    message_count: int = 0
    created_at: str
    updated_at: str


class PluginRun(BaseModel):
    plugin: str
    input: str
    session_id: Optional[str] = None


class PluginResult(BaseModel):
    plugin: str
    output: str
    success: bool
    error: Optional[str] = None


class AppSettings(BaseModel):
    default_model: str = "llama3"
    default_language: str = "en"
    temperature: float = 0.7
    max_history_turns: int = 10
    rag_top_k: int = 4
    theme: str = "dark"


class ExportFormat(str, Enum):
    markdown = "markdown"
    json = "json"
    txt = "txt"


class SessionRenameItem(BaseModel):
    session_id: str
    new_title: str

class BulkSessionRenameRequest(BaseModel):
    sessions: List[SessionRenameItem]

class PromptTemplateCreate(BaseModel):
    prompt_title: str = Field(..., min_length=1, max_length=200)
    prompt: str = Field(..., min_length=1)

class PromptTemplateUpdate(BaseModel):
    prompt_title: Optional[str] = None
    prompt: Optional[str] = None
