"""Settings router — /api/settings/{settings_id}."""
from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from dependencies import require_admin

from services.settings_service import (
    DEFAULT_AGENT_SETTINGS,
    load_settings,
    persist_settings,
)

router = APIRouter()


class AgentSettingsPayload(BaseModel):
    brandName: str = Field(default=DEFAULT_AGENT_SETTINGS["brandName"])
    greetingLine: str = Field(default=DEFAULT_AGENT_SETTINGS["greetingLine"])
    escalateCopy: str = Field(default=DEFAULT_AGENT_SETTINGS["escalateCopy"])
    businessHours: str = Field(default=DEFAULT_AGENT_SETTINGS["businessHours"])
    defaultTags: List[str] = Field(
        default_factory=lambda: list(DEFAULT_AGENT_SETTINGS["defaultTags"])
    )


def _normalize_id(settings_id: str) -> str:
    normalized = settings_id.strip().lower() if settings_id else "default"
    return normalized or "default"


@router.get("/{settings_id}")
def get_agent_settings(settings_id: str):
    """Public read — customer portal needs brand settings (brandName, greetingLine, etc.)."""
    return {"settings": load_settings(_normalize_id(settings_id))}


@router.put("/{settings_id}")
def update_agent_settings(settings_id: str, payload: AgentSettingsPayload, _user: Dict[str, Any] = Depends(require_admin)):
    saved = persist_settings(_normalize_id(settings_id), payload.model_dump())
    return {"settings": saved}
