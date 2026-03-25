"""Auth router — /api/auth/*"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from pydantic import BaseModel, EmailStr, Field

from db import (
    create_refresh_token as db_create_refresh_token,
    get_refresh_token as db_get_refresh_token,
    get_user_by_email,
    revoke_all_user_tokens,
    revoke_refresh_token,
    update_user_password,
)
from dependencies import get_current_user
from services.auth_service import (
    create_access_token,
    create_guest_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)

logger = logging.getLogger("marketing_tools.routers.auth")

router = APIRouter()

_REFRESH_COOKIE = "refresh_token"
_COOKIE_MAX_AGE = 7 * 24 * 60 * 60  # 7 days in seconds


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class LoginRequest(BaseModel):
    email: str = Field(min_length=1)
    password: str = Field(min_length=1)


class GuestSessionRequest(BaseModel):
    conversation_id: str = Field(min_length=1)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=_REFRESH_COOKIE,
        value=token,
        httponly=True,
        secure=False,   # set True in production with HTTPS
        samesite="lax",
        max_age=_COOKIE_MAX_AGE,
        path="/api/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=_REFRESH_COOKIE, path="/api/auth")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, response: Response):
    user = get_user_by_email(payload.email)
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="電子郵件或密碼錯誤",
        )
    if not user.get("is_active"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="帳號已停用")

    access_token = create_access_token(
        user_id=str(user["id"]),
        email=user["email"],
        role=user["role"],
    )
    plain, token_hash, expires_at = generate_refresh_token()
    db_create_refresh_token(
        user_id=str(user["id"]),
        token_hash=token_hash,
        expires_at=expires_at,
    )
    _set_refresh_cookie(response, plain)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": str(user["id"]),
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
        },
    }


@router.post("/refresh")
def refresh_token(response: Response, refresh_token: str | None = Cookie(default=None, alias=_REFRESH_COOKIE)):
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")

    token_hash = hash_refresh_token(refresh_token)
    record = db_get_refresh_token(token_hash)

    if not record:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    if record["revoked"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token revoked")

    expires_at = record["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")

    from db import get_user_by_id
    user = get_user_by_id(str(record["user_id"]))
    if not user or not user.get("is_active"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # Rotate refresh token
    revoke_refresh_token(token_hash)
    new_access = create_access_token(str(user["id"]), user["email"], user["role"])
    plain, new_hash, new_expires = generate_refresh_token()
    db_create_refresh_token(str(user["id"]), new_hash, new_expires)
    _set_refresh_cookie(response, plain)

    return {
        "access_token": new_access,
        "token_type": "bearer",
        "user": {
            "id": str(user["id"]),
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
        },
    }


@router.post("/logout")
def logout(
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=_REFRESH_COOKIE),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    if refresh_token:
        revoke_refresh_token(hash_refresh_token(refresh_token))
    _clear_refresh_cookie(response)
    return {"status": "logged out"}


@router.get("/me")
def get_me(current_user: Dict[str, Any] = Depends(get_current_user)):
    return {
        "id": str(current_user["id"]),
        "email": current_user["email"],
        "name": current_user["name"],
        "role": current_user["role"],
    }


@router.post("/guest-session")
def create_guest_session(payload: GuestSessionRequest):
    """Issue a short-lived token for the customer portal (no login required)."""
    token = create_guest_token(payload.conversation_id)
    return {"access_token": token, "token_type": "bearer"}


@router.patch("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Allow authenticated users to change their own password."""
    user = get_user_by_email(current_user["email"])
    if not user or not verify_password(payload.current_password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="目前密碼不正確",
        )
    update_user_password(str(current_user["id"]), hash_password(payload.new_password))
    return {"status": "ok"}
