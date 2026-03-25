"""User management router — /api/users/* (admin only)."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from db import (
    count_active_admins,
    create_user,
    get_user_by_email,
    get_user_by_id,
    list_users,
    set_user_active,
    update_user,
    update_user_password,
)
from dependencies import get_current_user, require_admin
from services.auth_service import hash_password

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class CreateUserPayload(BaseModel):
    email: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8)
    role: str = Field(default="agent", pattern="^(admin|agent)$")


class UpdateUserPayload(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    role: Optional[str] = Field(default=None, pattern="^(admin|agent)$")
    is_active: Optional[bool] = None


class ResetPasswordPayload(BaseModel):
    new_password: str = Field(min_length=8)


class ChangePasswordPayload(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8)


def _serialize(user: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(user["id"]),
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "isActive": user["is_active"],
        "createdAt": user["created_at"].isoformat() if user.get("created_at") else None,
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("", response_model=List[Dict[str, Any]])
def get_users(_user: Dict[str, Any] = Depends(require_admin)):
    return [_serialize(u) for u in list_users()]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_new_user(payload: CreateUserPayload, _user: Dict[str, Any] = Depends(require_admin)):
    if get_user_by_email(payload.email):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="此電子郵件已被使用")
    user = create_user(
        email=payload.email,
        name=payload.name,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    return _serialize(user)


@router.patch("/{user_id}")
def update_existing_user(
    user_id: str,
    payload: UpdateUserPayload,
    current_user: Dict[str, Any] = Depends(require_admin),
):
    target = get_user_by_id(user_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="使用者不存在")

    # Prevent removing the last active admin
    if payload.is_active is False or (payload.role is not None and payload.role != "admin"):
        if target["role"] == "admin" and target["is_active"]:
            if count_active_admins() <= 1:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="無法停用或降級最後一位管理員",
                )

    if payload.name is not None or payload.role is not None:
        target = update_user(user_id, name=payload.name, role=payload.role) or target

    if payload.is_active is not None:
        target = set_user_active(user_id, payload.is_active) or target

    return _serialize(target)


@router.patch("/{user_id}/password")
def reset_user_password(
    user_id: str,
    payload: ResetPasswordPayload,
    _user: Dict[str, Any] = Depends(require_admin),
):
    if not get_user_by_id(user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="使用者不存在")
    update_user_password(user_id, hash_password(payload.new_password))
    return {"status": "ok"}
