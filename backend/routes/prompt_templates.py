from fastapi import APIRouter, HTTPException
from models.schemas import PromptTemplateCreate, PromptTemplateUpdate
from services import db_service

router = APIRouter()

@router.get("/")
async def list_prompt_templates():
    """Fetch all prompt templates."""
    return db_service.get_all_prompt_templates()

@router.post("/")
async def create_prompt_template(body: PromptTemplateCreate):
    """Create a new prompt template."""
    template = db_service.create_prompt_template(
        prompt_title=body.prompt_title,
        prompt=body.prompt,
    )
    return template

@router.put("/{template_id}")
async def update_prompt_template(template_id: int, body: PromptTemplateUpdate):
    """Update an existing prompt template."""
    existing = db_service.get_prompt_template(template_id)
    if not existing:
        raise HTTPException(404, "Prompt template not found")
    db_service.update_prompt_template(
        template_id,
        prompt_title=body.prompt_title,
        prompt=body.prompt,
    )
    return db_service.get_prompt_template(template_id)

@router.delete("/{template_id}")
async def delete_prompt_template(template_id: int):
    """Delete a prompt template."""
    existing = db_service.get_prompt_template(template_id)
    if not existing:
        raise HTTPException(404, "Prompt template not found")
    db_service.delete_prompt_template(template_id)
    return {"status": "deleted", "template_id": template_id}