"""Settings routes — /api/settings"""

from fastapi import APIRouter, HTTPException, status
from models.schemas import AppSettings
from services.db_service import get_settings, save_setting

router = APIRouter()


@router.get("/")
async def get_all():
    return get_settings()


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

    # Save cleanly to db layer once structural validation boundaries pass
    for key, val in body.model_dump().items():
        save_setting(key, val)
        
    return get_settings()


@router.put("/{key}")
async def update_one(key: str, value: dict):
    save_setting(key, value.get("value"))
    return {"key": key, "updated": True}