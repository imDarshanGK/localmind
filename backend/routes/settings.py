"""Settings routes — /api/settings"""

from fastapi import APIRouter, HTTPException
from models.schemas import AppSettings
from services.db_service import get_settings, save_setting

router = APIRouter()


@router.get("/")
async def get_all():
    return get_settings()


@router.put("/")
async def update_settings(body: AppSettings):
    settings_dict = body.model_dump()

    # Secure boundary check for LLM temperature
    if "temperature" in settings_dict and settings_dict["temperature"] is not None:
        temp = settings_dict["temperature"]
        if not (0.0 <= temp <= 1.0):
            raise HTTPException(
                status_code=400,
                detail="Invalid configuration: Temperature must be strictly between 0.0 and 1.0",
            )

    for key, val in settings_dict.items():
        save_setting(key, val)
    return get_settings()


@router.put("/{key}")
async def update_one(key: str, value: dict):
    val = value.get("value")

    # Handle single key updates safely too
    if key == "temperature" and val is not None:
        if not (0.0 <= float(val) <= 1.0):
            raise HTTPException(
                status_code=400,
                detail="Invalid configuration: Temperature must be strictly between 0.0 and 1.0",
            )

    save_setting(key, val)
    return {"key": key, "updated": True}
