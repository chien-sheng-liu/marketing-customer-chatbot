from __future__ import annotations

import json
import shutil
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional


@dataclass
class DocumentSummary:
    id: str
    originalName: str
    storedName: str
    createdAt: str
    numChunks: int
    chunkSize: int
    chunkOverlap: int
    embeddingModel: str
    fileSize: int


class RagStore:
    def __init__(self, base_path: Path):
        self.base_path = base_path
        self.documents_path = self.base_path / "documents"
        self.index_file = self.base_path / "index.json"
        self.base_path.mkdir(parents=True, exist_ok=True)
        self.documents_path.mkdir(parents=True, exist_ok=True)
        if not self.index_file.exists():
            self._write_index([])

    def _read_json(self, path: Path, default: Any = None) -> Any:
        if not path.exists():
            return default
        with path.open('r', encoding='utf-8') as handle:
            try:
                return json.load(handle)
            except json.JSONDecodeError:
                return default

    def _write_json(self, path: Path, data: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open('w', encoding='utf-8') as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)

    def _read_index(self) -> List[Dict[str, Any]]:
        return self._read_json(self.index_file, default=[]) or []

    def _write_index(self, items: List[Dict[str, Any]]) -> None:
        temp_file = self.index_file.with_suffix('.tmp')
        with temp_file.open('w', encoding='utf-8') as handle:
            json.dump(items, handle, ensure_ascii=False, indent=2)
        temp_file.replace(self.index_file)

    def list_documents(self) -> List[Dict[str, Any]]:
        items = self._read_index()
        return sorted(items, key=lambda item: item.get('createdAt', ''), reverse=True)

    def get_document_summary(self, doc_id: str) -> Optional[Dict[str, Any]]:
        for item in self._read_index():
            if item.get('id') == doc_id:
                return item
        return None

    def save_document(
        self,
        *,
        original_name: str,
        binary_data: bytes,
        chunk_texts: List[str],
        embeddings: List[List[float]],
        chunk_size: int,
        chunk_overlap: int,
        embedding_model: str,
    ) -> Dict[str, Any]:
        if len(chunk_texts) != len(embeddings):
            raise ValueError('Chunks count does not match embeddings count')

        doc_id = uuid.uuid4().hex
        folder = self.documents_path / doc_id
        folder.mkdir(parents=True, exist_ok=True)

        extension = Path(original_name).suffix or '.txt'
        stored_name = f"{doc_id}{extension}"
        file_path = folder / stored_name
        with file_path.open('wb') as handle:
            handle.write(binary_data)

        chunk_records = []
        for text, embedding in zip(chunk_texts, embeddings):
            chunk_records.append({
                'id': uuid.uuid4().hex,
                'text': text,
                'embedding': embedding,
            })

        created_at = datetime.utcnow().isoformat()
        metadata = {
            'id': doc_id,
            'originalName': original_name,
            'storedName': stored_name,
            'createdAt': created_at,
            'numChunks': len(chunk_texts),
            'chunkSize': chunk_size,
            'chunkOverlap': chunk_overlap,
            'embeddingModel': embedding_model,
            'fileSize': len(binary_data),
        }

        self._write_json(folder / 'metadata.json', metadata)
        self._write_json(folder / 'chunks.json', chunk_records)

        index_items = [item for item in self._read_index() if item.get('id') != doc_id]
        index_items.append(metadata)
        self._write_index(index_items)

        return metadata

    def delete_document(self, doc_id: str) -> bool:
        folder = self.documents_path / doc_id
        if not folder.exists():
            return False
        shutil.rmtree(folder)
        index_items = [item for item in self._read_index() if item.get('id') != doc_id]
        self._write_index(index_items)
        return True

    def get_document_files(self, doc_id: str) -> Optional[Dict[str, Any]]:
        folder = self.documents_path / doc_id
        if not folder.exists():
            return None
        metadata = self._read_json(folder / 'metadata.json')
        chunks = self._read_json(folder / 'chunks.json', default=[])
        stored_name = metadata.get('storedName') if metadata else None
        file_path = folder / stored_name if stored_name else None
        if not metadata or not file_path or not file_path.exists():
            return None
        return {
            'metadata': metadata,
            'chunks': chunks,
            'file_path': file_path,
        }

    def load_chunk_records(self) -> List[Dict[str, Any]]:
        records: List[Dict[str, Any]] = []
        for summary in self.list_documents():
            doc_id = summary['id']
            data = self.get_document_files(doc_id)
            if not data:
                continue
            for chunk in data['chunks']:
                records.append({
                    'docId': doc_id,
                    'originalName': summary.get('originalName'),
                    'text': chunk.get('text', ''),
                    'embedding': chunk.get('embedding', []),
                })
        return records


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
