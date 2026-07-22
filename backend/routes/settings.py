"""Settings routes — /api/settings."""

import asyncio
import logging
import os
import time
from typing import Any, Callable

from fastapi import APIRouter, HTTPException, status
from models.schemas import AppSettings
from services.db_service import get_settings, save_setting, save_settings

router = APIRouter()
logger = logging.getLogger(__name__)

DEFAULT_SETTINGS_API_TIMEOUT_SECONDS = 2.0


def _resolve_settings_timeout_seconds() -> float:
    raw_timeout = os.getenv("SETTINGS_API_TIMEOUT_SECONDS", str(DEFAULT_SETTINGS_API_TIMEOUT_SECONDS))
    try:
        parsed_timeout = float(raw_timeout)
    except ValueError:
        logger.warning(
            "settings_timeout_invalid raw_value=%s fallback_timeout_s=%s",
            raw_timeout,
            DEFAULT_SETTINGS_API_TIMEOUT_SECONDS,
        )
        return DEFAULT_SETTINGS_API_TIMEOUT_SECONDS
    if parsed_timeout <= 0:
        logger.warning(
            "settings_timeout_non_positive timeout_s=%s fallback_timeout_s=%s",
            parsed_timeout,
            DEFAULT_SETTINGS_API_TIMEOUT_SECONDS,
        )
        return DEFAULT_SETTINGS_API_TIMEOUT_SECONDS
    return parsed_timeout


SETTINGS_API_TIMEOUT_SECONDS = _resolve_settings_timeout_seconds()


async def _run_with_timeout(operation: str, function: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    start_time = time.perf_counter()
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(function, *args, **kwargs),
            timeout=SETTINGS_API_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        duration_ms = round((time.perf_counter() - start_time) * 1000, 3)
        logger.warning(
            "settings_operation_timeout operation=%s timeout_s=%s duration_ms=%s",
            operation,
            SETTINGS_API_TIMEOUT_SECONDS,
            duration_ms,
        )
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=f"Settings {operation} operation timed out after {SETTINGS_API_TIMEOUT_SECONDS} seconds.",
        ) from exc
@router.get("/")
async def get_all():
    return await _run_with_timeout("read", get_settings)


@router.put("/")
async def update_settings(body: AppSettings):
    # 1. Enforce safety validation boundary limits on Temperature
    if body.temperature < 0.0 or body.temperature > 2.0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{
                "loc": ["body", "temperature"],
                "msg": "Temperature must scale cleanly between 0.0 and 2.0.",
                "type": "value_error"
            }]
        )
        
    # 2. Enforce safety validation boundary limits on RAG Context Chunks
    if body.rag_top_k < 1 or body.rag_top_k > 10:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{
                "loc": ["body", "rag_top_k"],
                "msg": "RAG Context chunks selection must stay between 1 and 10.",
                "type": "value_error"
            }]
        )
    
    # 3. Enforce safety validation boundary limits on RAG Chunk Overlap
    if body.rag_chunk_overlap < 0 or body.rag_chunk_overlap > 200:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{
                "loc": ["body", "rag_chunk_overlap"],
                "msg": "RAG chunk overlap must be between 0 and 200 characters.",
                "type": "value_error"
            }]
        )

    payload = body.model_dump()
    await _run_with_timeout("save", save_settings, payload)
    return await _run_with_timeout("read", get_settings)


@router.put("/{key}")
async def update_one(key: str, value: dict):
    await _run_with_timeout("save", save_setting, key, value.get("value"))
    return {"key": key, "updated": True}