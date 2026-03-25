"""Canned responses router — /api/canned-responses."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from dependencies import get_current_user

from db import (
    create_canned_response as db_create,
    delete_canned_response as db_delete,
    list_canned_responses as db_list,
)

router = APIRouter()


class CannedResponsePayload(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    content: str = Field(min_length=1)


@router.get("")
def get_canned_responses(_user=Depends(get_current_user)):
    return {"responses": db_list()}


@router.post("")
def create_canned_response(payload: CannedResponsePayload, _user=Depends(get_current_user)):
    return db_create(payload.title.strip(), payload.content.strip())


@router.delete("/{response_id}")
def delete_canned_response(response_id: str, _user=Depends(get_current_user)):
    if not db_delete(response_id):
        raise HTTPException(status_code=404, detail="Response not found")
    return {"status": "deleted"}
