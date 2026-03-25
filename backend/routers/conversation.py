"""Conversation router — /api/conversations/*."""
from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from dependencies import get_agent_or_guest, get_current_user

from db import (
    create_conversation as db_create_conversation,
    delete_conversation as db_delete_conversation,
    fetch_conversation_messages as db_fetch_messages,
    insert_conversation_message as db_insert_message,
    list_conversations as db_list_conversations,
    update_conversation_status as db_update_status,
)

logger = logging.getLogger("marketing_tools.routers.conversation")

router = APIRouter()

DEFAULT_WELCOME_MESSAGE = os.getenv(
    "DEFAULT_WELCOME_MESSAGE",
    "歡迎！請先選擇是否為會員：非會員可直接開始諮詢，會員輸入編號即可啟動個人化服務。",
)


class CreateConversationPayload(BaseModel):
    displayName: str = Field(default="", max_length=100)


class ConversationMessagePayload(BaseModel):
    role: str
    content: str


class UpdateStatusPayload(BaseModel):
    status: str = Field(pattern="^(open|active|resolved)$")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _normalize_id(conversation_id: str) -> str:
    normalized = conversation_id.strip().lower() if conversation_id else "default"
    return normalized or "default"


def _serialize_timestamp(value: Optional[datetime]) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, str):
        return value
    return datetime.utcnow().isoformat()


def _serialize_message(record: Dict[str, Any]) -> Dict[str, str]:
    return {
        "id": record["id"],
        "role": record["role"],
        "content": record["content"],
        "timestamp": _serialize_timestamp(record.get("created_at")),
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("")
def get_conversations(_user=Depends(get_current_user)):
    return {"conversations": db_list_conversations()}


@router.post("")
def create_conversation(payload: CreateConversationPayload):
    """Public endpoint — customer portal creates conversations without auth."""
    display_name = payload.displayName.strip() or "新對話"
    return db_create_conversation(display_name)


@router.delete("/{conversation_id}")
def delete_conversation(conversation_id: str, _user=Depends(get_current_user)):
    conv_id = _normalize_id(conversation_id)
    if not db_delete_conversation(conv_id):
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"status": "deleted"}


@router.patch("/{conversation_id}/status")
def update_conversation_status(conversation_id: str, payload: UpdateStatusPayload, _user=Depends(get_current_user)):
    conv_id = _normalize_id(conversation_id)
    updated = db_update_status(conv_id, payload.status)
    if not updated:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return updated


@router.get("/{conversation_id}/messages")
def get_messages(conversation_id: str, _user=Depends(get_agent_or_guest)):
    conv_id = _normalize_id(conversation_id)
    records = db_fetch_messages(conv_id)
    if not records:
        welcome = db_insert_message(conv_id, "assistant", DEFAULT_WELCOME_MESSAGE)
        records = [welcome]
    return {"messages": [_serialize_message(r) for r in records]}


@router.post("/{conversation_id}/messages")
def add_message(conversation_id: str, payload: ConversationMessagePayload, _user=Depends(get_agent_or_guest)):
    conv_id = _normalize_id(conversation_id)
    role = (payload.role or "user").lower()
    if role not in {"user", "assistant"}:
        raise HTTPException(status_code=400, detail="role 必須為 user 或 assistant")
    record = db_insert_message(conv_id, role, payload.content)
    return _serialize_message(record)


