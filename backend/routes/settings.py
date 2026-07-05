"""Settings routes — /api/settings"""
import logging\

from fastapi import APIRouter

from models.schemas import AppSettings
from services.db_service import get_settings, save_setting


router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/")
async def get_all():
    return get_settings()


@router.put("/")
async def update_settings(body: AppSettings):
    current_settings = get_settings()

    for key, val in body.model_dump().items():
        if key == "default_model":
            old_model = current_settings.get("default_model")
            if old_model != val:
                logger.info(
                    "Model switched from '%s' to '%s'",
                    old_model,
                    val,
                )

        save_setting(key, val)

    return get_settings()


@router.put("/{key}")
async def update_one(key: str, value: dict):
    new_value = value.get("value")

    if key == "default_model":
        old_model = get_settings().get("default_model")
        if old_model != new_value:
            logger.info(
                "Model switched from '%s' to '%s'",
                old_model,
                new_value,
            )

    save_setting(key, new_value)
    return {"key": key, "updated": True}
