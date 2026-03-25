"""Auth Service — password hashing + JWT lifecycle."""
from __future__ import annotations

import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

import bcrypt
from jose import JWTError, jwt

JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("JWT_REFRESH_TOKEN_EXPIRE_DAYS", "7"))


# ---------------------------------------------------------------------------
# Password
# ---------------------------------------------------------------------------


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Access token (short-lived JWT)
# ---------------------------------------------------------------------------


def create_access_token(user_id: str, email: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_guest_token(conversation_id: str) -> str:
    """Short-lived token for customer portal — scoped to one conversation."""
    expire = datetime.now(timezone.utc) + timedelta(hours=24)
    payload = {
        "sub": conversation_id,
        "role": "customer",
        "conversation_id": conversation_id,
        "exp": expire,
        "type": "guest",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        return None


# ---------------------------------------------------------------------------
# Refresh token (opaque, stored in DB as SHA-256 hash)
# ---------------------------------------------------------------------------


def generate_refresh_token() -> Tuple[str, str, datetime]:
    """Returns (plain_token, token_hash, expires_at)."""
    plain = secrets.token_urlsafe(48)
    token_hash = _hash_token(plain)
    expires_at = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    return plain, token_hash, expires_at


def hash_refresh_token(plain: str) -> str:
    return _hash_token(plain)


def _hash_token(plain: str) -> str:
    return hashlib.sha256(plain.encode()).hexdigest()
