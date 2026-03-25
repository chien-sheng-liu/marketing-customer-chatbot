"""Settings Service — file-backed per-tenant agent settings."""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from threading import Lock
from typing import Any, Dict, List

logger = logging.getLogger("marketing_tools.settings_service")

BASE_DIR = Path(__file__).resolve().parent.parent
_STORAGE_ROOT = Path(os.getenv("RAG_STORAGE_PATH", str(BASE_DIR / "storage")))
_STORAGE_ROOT.mkdir(parents=True, exist_ok=True)
SETTINGS_FILE = _STORAGE_ROOT / "agent_settings.json"

DEFAULT_AGENT_SETTINGS: Dict[str, Any] = {
    "brandName": "客服助手",
    "greetingLine": "有什麼可以幫您的嗎？",
    "escalateCopy": "您的需求需要專人協助，正在為您轉接，請稍候...",
    "businessHours": "週一至週五 09:00-18:00",
    "defaultTags": ["一般客服"],
}

_lock = Lock()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _read_store() -> Dict[str, Any]:
    if not SETTINGS_FILE.exists():
        return {}
    try:
        with SETTINGS_FILE.open("r", encoding="utf-8") as fh:
            return json.load(fh)
    except json.JSONDecodeError:
        return {}


def _write_store(data: Dict[str, Any]) -> None:
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = SETTINGS_FILE.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
    tmp.replace(SETTINGS_FILE)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def load_settings(settings_id: str) -> Dict[str, Any]:
    with _lock:
        all_settings = _read_store()
        record = all_settings.get(settings_id, {})
        merged = {**DEFAULT_AGENT_SETTINGS, **record}
        tags = record.get("defaultTags", DEFAULT_AGENT_SETTINGS["defaultTags"])
        if not isinstance(tags, list):
            tags = DEFAULT_AGENT_SETTINGS["defaultTags"]
        merged["defaultTags"] = (
            [t for t in tags if isinstance(t, str)] or DEFAULT_AGENT_SETTINGS["defaultTags"]
        )
        return merged


def persist_settings(settings_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    with _lock:
        all_settings = _read_store()
        record = dict(payload)
        tags: List[str] = [
            t.strip()
            for t in record.get("defaultTags", [])
            if isinstance(t, str) and t.strip()
        ]
        record["defaultTags"] = tags
        all_settings[settings_id] = record
        _write_store(all_settings)
        merged = {**DEFAULT_AGENT_SETTINGS, **record}
        merged["defaultTags"] = record["defaultTags"] or DEFAULT_AGENT_SETTINGS["defaultTags"]
        return merged
