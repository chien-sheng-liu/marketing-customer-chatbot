"""Analysis router — /api/analyze, /api/kb-query, /api/report."""
from __future__ import annotations

import json
import logging
from typing import List, Optional

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from dependencies import get_current_user
from knowledge_base import KNOWLEDGE_BASE
from services.ai_service import format_conversation, get_rag_matches, run_completion

logger = logging.getLogger("marketing_tools.routers.analysis")

router = APIRouter()


class MessagePayload(BaseModel):
    role: Optional[str] = None
    content: str


class AnalyzeRequest(BaseModel):
    history: List[MessagePayload] = Field(default_factory=list)


class KnowledgeBaseRequest(BaseModel):
    query: str = Field(min_length=1)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/analyze")
def analyze_conversation(payload: AnalyzeRequest, _user: Dict[str, Any] = Depends(get_current_user)):
    conversation_text = format_conversation(payload.history)
    last_user_message = next(
        (msg.content for msg in reversed(payload.history) if (msg.role or "").lower() == "user"),
        "",
    )
    rag_matches = get_rag_matches(last_user_message, top_k=3) if last_user_message else []
    rag_context = ""
    if rag_matches:
        lines = ["ADDITIONAL DOC SNIPPETS (use these for accurate answers):"]
        for idx, match in enumerate(rag_matches, start=1):
            lines.append(
                f"{idx}. Source: {match['filename']} | Score: {match['score']}\n{match['snippet']}"
            )
        rag_context = "\n".join(lines)

    prompt = f"""You are an AI assistant that supports a Taiwanese ecommerce customer-service lead.
Use ONLY the internal knowledge base below to reason about the latest conversation.

INTERNAL KNOWLEDGE BASE:
{KNOWLEDGE_BASE}

{rag_context if rag_context else ''}

CONVERSATION HISTORY:
{conversation_text}

Return a valid JSON object with the following fields:
{{
  "tags": array of strings,
  "sentiment": one of "positive", "neutral", "negative", "angry",
  "routing": one of "none", "dietitian", "senior_agent", "risk_alert",
  "suggestedReply": string written in Traditional Chinese without Markdown,
  "upsellOpportunity": {{ "detected": boolean, "suggestion": string }},
  "reasoning": short Traditional Chinese explanation without Markdown
}}

Answer in JSON ONLY."""

    try:
        raw = run_completion(
            "You are an AI copilot for a Taiwanese CS lead. ALWAYS respond with strict JSON and avoid Markdown.",
            prompt,
            json_mode=True,
        )
        return json.loads(raw)
    except json.JSONDecodeError as error:
        logger.exception("Invalid JSON returned by ChatGPT: %s", raw)
        raise HTTPException(status_code=502, detail="Invalid JSON returned by ChatGPT") from error


@router.post("/kb-query")
def query_knowledge_base(payload: KnowledgeBaseRequest, _user: Dict[str, Any] = Depends(get_current_user)):
    prompt = f"""You are an internal SOP search bot.
Answer strictly based on the knowledge base below.

INTERNAL SOPs:
{KNOWLEDGE_BASE}

Agent question: {payload.query}

Instructions:
1. Reply in Traditional Chinese using only plain text.
2. If the answer is not covered, be honest about it."""

    result = run_completion(
        "You answer SOP questions in Traditional Chinese plain text.",
        prompt,
    )
    return {"result": result}


@router.post("/report")
def generate_daily_report(_user: Dict[str, Any] = Depends(get_current_user)):
    prompt = """請為客服主管生成一份簡潔的「每日營運洞察報告」。
假設今天的趨勢如下：
- 因颱風延遲，物流相關查詢增加 30%。
- 關於「鎂複方 (Magnesium Complex)」庫存的詢問偏多。
- 有 2 起關於「取消訂閱按鈕失效」的憤怒客訴。

格式要求：
1. 使用繁體中文撰寫。
2. 使用純文字，允許以 - 作為項目符號。
3. 結構包含：流量與情緒總覽、主要議題、策略與銷售機會、明日行動建議。
"""
    report = run_completion(
        "You summarize CS insights in Traditional Chinese plain text.",
        prompt,
    )
    return {"report": report}
