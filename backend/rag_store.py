from typing import Any, Dict, List, Optional

from db import (
    delete_document as db_delete_document,
    get_document_with_chunks as db_get_document_with_chunks,
    list_documents as db_list_documents,
    load_chunk_records as db_load_chunk_records,
    save_document as db_save_document,
)


class RagStore:
    def list_documents(self) -> List[Dict[str, Any]]:
        return db_list_documents()

    def save_document(
        self,
        *,
        original_name: str,
        mime_type: Optional[str],
        binary_data: bytes,
        chunk_texts: List[str],
        embeddings: List[List[float]],
        chunk_size: int,
        chunk_overlap: int,
        embedding_model: str,
    ) -> Dict[str, Any]:
        return db_save_document(
            original_name=original_name,
            mime_type=mime_type,
            binary_data=binary_data,
            chunk_texts=chunk_texts,
            embeddings=embeddings,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            embedding_model=embedding_model,
        )

    def delete_document(self, doc_id: str) -> bool:
        return db_delete_document(doc_id)

    def get_document_files(self, doc_id: str) -> Optional[Dict[str, Any]]:
        return db_get_document_with_chunks(doc_id)

    def load_chunk_records(self) -> List[Dict[str, Any]]:
        return db_load_chunk_records()


def chunk_text(text: str, *, size: int, overlap: int) -> List[str]:
    cleaned = text.replace('\r\n', '\n').strip()
    if not cleaned:
        return []

    chunks: List[str] = []
    start = 0
    text_length = len(cleaned)
    stride = max(size - overlap, 1)

    while start < text_length:
        end = min(text_length, start + size)
        chunk = cleaned[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start += stride

    return chunks
