"""Member router — /api/members/*."""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException

from dependencies import get_agent_or_guest

from db import fetch_member, fetch_member_purchases

logger = logging.getLogger("marketing_tools.routers.member")

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _serialize_timestamp(value: Optional[datetime]) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, str):
        return value
    return datetime.utcnow().isoformat()


def _serialize_member(record: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "memberId": record["member_id"],
        "name": record["name"],
        "email": record["email"],
        "phone": record.get("phone"),
        "tier": record.get("tier"),
        "city": record.get("city"),
        "status": record.get("status"),
        "joinedAt": _serialize_timestamp(record.get("joined_at")),
    }


def _serialize_purchase(record: Dict[str, Any]) -> Dict[str, Any]:
    amount = record.get("amount")
    return {
        "id": record.get("id"),
        "productName": record.get("product_name"),
        "amount": float(amount) if amount is not None else 0.0,
        "currency": record.get("currency"),
        "channel": record.get("channel"),
        "purchasedAt": _serialize_timestamp(record.get("purchased_at")),
        "notes": record.get("notes"),
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/{member_id}")
def get_member_profile(member_id: str, _user=Depends(get_agent_or_guest)):
    member_id = member_id.strip()
    if not member_id:
        raise HTTPException(status_code=400, detail="Member ID is required")
    record = fetch_member(member_id)
    if not record:
        raise HTTPException(status_code=404, detail="Member not found")
    return {"member": _serialize_member(record)}


@router.get("/{member_id}/purchases")
def get_member_purchases(member_id: str, limit: int = 25, _user=Depends(get_agent_or_guest)):
    member_id = member_id.strip()
    if not member_id:
        raise HTTPException(status_code=400, detail="Member ID is required")
    limit = max(1, min(limit, 100))
    purchases = fetch_member_purchases(member_id, limit)
    if not purchases:
        record = fetch_member(member_id)
        if not record:
            raise HTTPException(status_code=404, detail="Member not found")
    return {"purchases": [_serialize_purchase(p) for p in purchases]}
