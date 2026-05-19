"""Pydantic schemas for LocalMind API."""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str
    timestamp: Optional[datetime] = None


class ChatRequest(BaseModel):
    message: str
    session_id: str
    model: str = "llama3"
    use_documents: bool = True  # use RAG if docs uploaded


class ChatResponse(BaseModel):
    reply: str
    session_id: str
    model: str
    sources: list[str] = []  # document sources used


class UploadResponse(BaseModel):
    filename: str
    status: str
    chunks_indexed: int
    message: str


class ModelInfo(BaseModel):
    name: str
    size: str
    status: str  # "available" or "not_pulled"
