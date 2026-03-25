"""RAG router — /api/rag/*."""
from __future__ import annotations

import logging
import os
from io import BytesIO
from pathlib import Path

from typing import Any, Dict

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from dependencies import require_admin
from services.ai_service import embed_texts, extract_document_text, get_rag_matches, rag_store
from rag_store import chunk_text

logger = logging.getLogger("marketing_tools.routers.rag")

router = APIRouter()

RAG_CHUNK_SIZE = int(os.getenv("RAG_CHUNK_SIZE", "800"))
RAG_CHUNK_OVERLAP = int(os.getenv("RAG_CHUNK_OVERLAP", "200"))
RAG_MAX_FILE_BYTES = int(os.getenv("RAG_MAX_FILE_BYTES", str(20 * 1024 * 1024)))
RAG_ALLOWED_EXTENSIONS = {".txt", ".md", ".markdown", ".pdf", ".docx", ".xlsx"}
EMBEDDING_MODEL = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")


class RagSearchRequest(BaseModel):
    query: str = Field(min_length=1)
    topK: int = Field(default=3, ge=1, le=10)


class KbEntryPayload(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/documents")
def list_rag_documents(_user: Dict[str, Any] = Depends(require_admin)):
    return rag_store.list_documents()


@router.post("/documents")
async def upload_rag_document(file: UploadFile = File(...), _user: Dict[str, Any] = Depends(require_admin)):
    filename = file.filename or "document.txt"
    extension = Path(filename).suffix.lower() or ".txt"
    if extension not in RAG_ALLOWED_EXTENSIONS:
        allowed = ", ".join(sorted(RAG_ALLOWED_EXTENSIONS))
        raise HTTPException(status_code=400, detail=f"不支援的文件格式。允許：{allowed}")

    binary = await file.read()
    if not binary:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(binary) > RAG_MAX_FILE_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds the maximum size limit")

    text_content = extract_document_text(filename, binary)
    if not text_content.strip():
        raise HTTPException(status_code=400, detail="文件中沒有可用的文字內容")

    chunks = chunk_text(text_content, size=RAG_CHUNK_SIZE, overlap=RAG_CHUNK_OVERLAP)
    if not chunks:
        raise HTTPException(status_code=400, detail="Unable to extract text chunks from the file")

    embeddings = embed_texts(chunks)
    summary = rag_store.save_document(
        original_name=filename,
        mime_type=file.content_type,
        binary_data=binary,
        chunk_texts=chunks,
        embeddings=embeddings,
        chunk_size=RAG_CHUNK_SIZE,
        chunk_overlap=RAG_CHUNK_OVERLAP,
        embedding_model=EMBEDDING_MODEL,
    )
    return summary


@router.get("/documents/{doc_id}/download")
def download_rag_document(doc_id: str, _user: Dict[str, Any] = Depends(require_admin)):
    document = rag_store.get_document_files(doc_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    metadata = document["metadata"]
    file_bytes = document["file_data"]
    media_type = metadata.get("mimeType", "application/octet-stream")
    filename = metadata.get("originalName", "document")
    return StreamingResponse(
        BytesIO(file_bytes),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/documents/{doc_id}")
def delete_rag_document(doc_id: str, _user: Dict[str, Any] = Depends(require_admin)):
    if not rag_store.delete_document(doc_id):
        raise HTTPException(status_code=404, detail="Document not found")
    return {"status": "deleted"}


@router.post("/search")
def rag_semantic_search(payload: RagSearchRequest, _user: Dict[str, Any] = Depends(require_admin)):
    query = payload.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query is required")
    matches = get_rag_matches(query, payload.topK)
    return {"matches": matches}


@router.post("/entries")
def create_kb_entry(payload: KbEntryPayload, _user: Dict[str, Any] = Depends(require_admin)):
    title = payload.title.strip()
    content = payload.content.strip()
    filename = f"{title}.txt"
    binary = content.encode("utf-8")
    chunks = chunk_text(content, size=RAG_CHUNK_SIZE, overlap=RAG_CHUNK_OVERLAP)
    if not chunks:
        raise HTTPException(status_code=400, detail="內容太短，無法建立知識條目")
    embeddings = embed_texts(chunks)
    return rag_store.save_document(
        original_name=filename,
        mime_type="text/plain",
        binary_data=binary,
        chunk_texts=chunks,
        embeddings=embeddings,
        chunk_size=RAG_CHUNK_SIZE,
        chunk_overlap=RAG_CHUNK_OVERLAP,
        embedding_model=EMBEDDING_MODEL,
    )
