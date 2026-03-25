import json
import os
import random
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional
from uuid import uuid4

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool


def _build_database_url() -> str:
    direct = os.getenv("DATABASE_URL")
    if direct:
        return direct
    host = os.getenv("DB_HOST", "localhost")
    port = os.getenv("DB_PORT", "8002")
    user = os.getenv("DB_USER", "db_admin")
    password = os.getenv("DB_PASSWORD", "db_password")
    name = os.getenv("DB_NAME", "marketing_tools")
    return f"postgresql://{user}:{password}@{host}:{port}/{name}"


DATABASE_URL = _build_database_url()
DB_POOL = ConnectionPool(
    conninfo=DATABASE_URL,
    min_size=1,
    max_size=int(os.getenv("DB_POOL_MAX", "10")),
    kwargs={"autocommit": True, "row_factory": dict_row},
)


DOCUMENTS_SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY,
    original_name TEXT NOT NULL,
    mime_type TEXT,
    file_size INTEGER,
    chunk_size INTEGER,
    chunk_overlap INTEGER,
    embedding_model TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    file_data BYTEA NOT NULL
);
"""

CHUNKS_SCHEMA = """
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_document_chunks_doc ON document_chunks(document_id);
"""

CONV_SCHEMA = """
CREATE TABLE IF NOT EXISTS conversation_messages (
    id UUID PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conversation_messages ON conversation_messages(conversation_id, created_at);
"""

MEMBER_SCHEMA = """
CREATE TABLE IF NOT EXISTS members (
    id SERIAL PRIMARY KEY,
    member_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    tier TEXT,
    city TEXT,
    joined_at TIMESTAMPTZ NOT NULL,
    birthday DATE,
    status TEXT DEFAULT 'active'
);
"""

PURCHASE_SCHEMA = """
CREATE TABLE IF NOT EXISTS purchases (
    id UUID PRIMARY KEY,
    member_id TEXT NOT NULL REFERENCES members(member_id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    currency TEXT NOT NULL,
    channel TEXT,
    purchased_at TIMESTAMPTZ NOT NULL,
    notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_purchases_member ON purchases(member_id, purchased_at DESC);
"""


SAMPLE_MEMBERS = [
    {"member_id": "M10001", "name": "陳柏宇", "email": "m10001@example.com", "phone": "0911-100-001", "tier": "黑鑽", "city": "台北", "joined_days_ago": 540},
    {"member_id": "M10002", "name": "林語婕", "email": "m10002@example.com", "phone": "0922-200-002", "tier": "白金", "city": "新竹", "joined_days_ago": 420},
    {"member_id": "M10003", "name": "王泰源", "email": "m10003@example.com", "phone": "0933-300-003", "tier": "白金", "city": "台中", "joined_days_ago": 610},
    {"member_id": "M10004", "name": "趙欣怡", "email": "m10004@example.com", "phone": "0966-400-004", "tier": "金卡", "city": "台南", "joined_days_ago": 260},
    {"member_id": "M10005", "name": "許育誠", "email": "m10005@example.com", "phone": "0955-500-005", "tier": "金卡", "city": "高雄", "joined_days_ago": 310},
    {"member_id": "M10006", "name": "吳佳蓉", "email": "m10006@example.com", "phone": "0977-600-006", "tier": "白金", "city": "桃園", "joined_days_ago": 180},
    {"member_id": "M10007", "name": "劉家誠", "email": "m10007@example.com", "phone": "0988-700-007", "tier": "黑鑽", "city": "台北", "joined_days_ago": 780},
    {"member_id": "M10008", "name": "黃麗華", "email": "m10008@example.com", "phone": "0912-800-008", "tier": "銀卡", "city": "台中", "joined_days_ago": 95},
    {"member_id": "M10009", "name": "簡志豪", "email": "m10009@example.com", "phone": "0938-900-009", "tier": "銀卡", "city": "新北", "joined_days_ago": 210},
    {"member_id": "M10010", "name": "張鈺婷", "email": "m10010@example.com", "phone": "0952-000-010", "tier": "金卡", "city": "嘉義", "joined_days_ago": 365},
]

PRODUCT_CATALOG = [
    {"name": "鎂複方 (Magnesium Complex)", "price": 1280.0},
    {"name": "植萃高效蛋白", "price": 890.0},
    {"name": "夜間舒眠軟糖", "price": 690.0},
    {"name": "女力平衡配方", "price": 1580.0},
    {"name": "防禦力小藍包", "price": 980.0},
    {"name": "肝臟循環加乘", "price": 1380.0},
]

CHANNELS = ["官網", "LINE", "門市", "App", "合作電商"]

CONVERSATIONS_SCHEMA = """
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

CANNED_RESPONSES_SCHEMA = """
CREATE TABLE IF NOT EXISTS canned_responses (
    id UUID PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

USERS_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'agent'
                CHECK (role IN ('admin', 'agent')),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

REFRESH_TOKENS_SCHEMA = """
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
"""


def init_db() -> None:
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(DOCUMENTS_SCHEMA)
            cur.execute(CHUNKS_SCHEMA)
            cur.execute(CONV_SCHEMA)
            cur.execute(CONVERSATIONS_SCHEMA)
            cur.execute(CANNED_RESPONSES_SCHEMA)
            # Migrate existing 'default' conversation messages
            cur.execute("SELECT COUNT(*) AS count FROM conversations")
            row = cur.fetchone()
            if row and row["count"] == 0:
                cur.execute(
                    "SELECT COUNT(*) AS count FROM conversation_messages WHERE conversation_id = 'default'"
                )
                msg_row = cur.fetchone()
                if msg_row and msg_row["count"] > 0:
                    cur.execute(
                        "INSERT INTO conversations (id, display_name) VALUES ('default', '預設對話') ON CONFLICT DO NOTHING"
                    )
            cur.execute(MEMBER_SCHEMA)
            cur.execute(PURCHASE_SCHEMA)
            cur.execute(USERS_SCHEMA)
            cur.execute(REFRESH_TOKENS_SCHEMA)
            _seed_members(cur)
            _seed_purchases(cur)


def _seed_members(cur) -> None:
    cur.execute("SELECT COUNT(*) AS count FROM members")
    row = cur.fetchone()
    if row and row["count"] >= len(SAMPLE_MEMBERS):
        return
    now = datetime.utcnow()
    for member in SAMPLE_MEMBERS:
        joined_at = now - timedelta(days=member["joined_days_ago"])
        cur.execute(
            """
            INSERT INTO members (member_id, name, email, phone, tier, city, joined_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (member_id) DO NOTHING
            """,
            (
                member["member_id"],
                member["name"],
                member["email"],
                member["phone"],
                member["tier"],
                member["city"],
                joined_at,
            ),
        )


def _seed_purchases(cur) -> None:
    cur.execute("SELECT COUNT(*) AS count FROM purchases")
    row = cur.fetchone()
    if row and row["count"] >= 100:
        return
    rng = random.Random(42)
    now = datetime.utcnow()
    member_ids = [member["member_id"] for member in SAMPLE_MEMBERS]
    for _ in range(100):
        member_id = rng.choice(member_ids)
        product = rng.choice(PRODUCT_CATALOG)
        base_price = Decimal(str(product["price"]))
        discount = Decimal(str(round(rng.uniform(0, 0.2), 2)))
        amount = (base_price * (Decimal("1") - discount)).quantize(Decimal("0.01"))
        purchased_at = now - timedelta(days=rng.randint(0, 180), hours=rng.randint(0, 23))
        cur.execute(
            """
            INSERT INTO purchases (id, member_id, product_name, amount, currency, channel, purchased_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING
            """,
            (
                uuid4().hex,
                member_id,
                product["name"],
                amount,
                "TWD",
                rng.choice(CHANNELS),
                purchased_at,
            ),
        )


def fetch_member(member_id: str) -> Optional[Dict[str, Any]]:
    if not member_id:
        return None
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT member_id, name, email, phone, tier, city, joined_at, status FROM members WHERE member_id=%s",
                (member_id,),
            )
            row = cur.fetchone()
            return dict(row) if row else None


def fetch_member_purchases(member_id: str, limit: int = 25) -> List[Dict[str, Any]]:
    if not member_id:
        return []
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, product_name, amount, currency, channel, purchased_at
                FROM purchases
                WHERE member_id=%s
                ORDER BY purchased_at DESC
                LIMIT %s
                """,
                (member_id, limit),
            )
            rows = cur.fetchall() or []
            return [dict(row) for row in rows]


def insert_conversation_message(conversation_id: str, role: str, content: str) -> Dict[str, Any]:
    message_id = uuid4().hex
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO conversation_messages (id, conversation_id, role, content)
                VALUES (%s, %s, %s, %s)
                RETURNING id, conversation_id, role, content, created_at
                """,
                (message_id, conversation_id, role, content),
            )
            row = cur.fetchone()
            return dict(row)


def fetch_conversation_messages(conversation_id: str) -> List[Dict[str, Any]]:
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, conversation_id, role, content, created_at
                FROM conversation_messages
                WHERE conversation_id=%s
                ORDER BY created_at ASC
                """,
                (conversation_id,),
            )
            rows = cur.fetchall() or []
            return [dict(row) for row in rows]


def create_conversation(display_name: str) -> Dict[str, Any]:
    conv_id = f"conv-{uuid4().hex[:8]}"
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO conversations (id, display_name) VALUES (%s, %s) RETURNING id, display_name, status, created_at",
                (conv_id, display_name),
            )
            row = dict(cur.fetchone())
            return {
                "id": row["id"],
                "displayName": row["display_name"],
                "status": row["status"],
                "createdAt": row["created_at"].isoformat(),
                "lastMessageAt": None,
                "lastMessage": None,
            }


def list_conversations() -> List[Dict[str, Any]]:
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    c.id, c.display_name, c.status, c.created_at,
                    MAX(m.created_at) AS last_message_at,
                    (SELECT content FROM conversation_messages
                     WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message
                FROM conversations c
                LEFT JOIN conversation_messages m ON m.conversation_id = c.id
                GROUP BY c.id
                ORDER BY COALESCE(MAX(m.created_at), c.created_at) DESC
            """)
            rows = cur.fetchall() or []
            result = []
            for row in rows:
                r = dict(row)
                result.append({
                    "id": r["id"],
                    "displayName": r["display_name"],
                    "status": r["status"],
                    "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
                    "lastMessageAt": r["last_message_at"].isoformat() if r["last_message_at"] else None,
                    "lastMessage": r["last_message"],
                })
            return result


def delete_conversation(conv_id: str) -> bool:
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM conversation_messages WHERE conversation_id = %s", (conv_id,))
            cur.execute("DELETE FROM conversations WHERE id = %s RETURNING id", (conv_id,))
            return cur.fetchone() is not None


def update_conversation_status(conv_id: str, status: str) -> Optional[Dict[str, Any]]:
    valid = {'open', 'active', 'resolved'}
    if status not in valid:
        return None
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE conversations SET status = %s WHERE id = %s RETURNING id, display_name, status, created_at",
                (status, conv_id),
            )
            row = cur.fetchone()
            if not row:
                return None
            r = dict(row)
            return {"id": r["id"], "displayName": r["display_name"], "status": r["status"]}


def create_canned_response(title: str, content: str) -> Dict[str, Any]:
    response_id = str(uuid4())
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO canned_responses (id, title, content) VALUES (%s, %s, %s) RETURNING id, title, content, created_at",
                (response_id, title, content),
            )
            row = dict(cur.fetchone())
            return {"id": str(row["id"]), "title": row["title"], "content": row["content"], "createdAt": row["created_at"].isoformat()}


def list_canned_responses() -> List[Dict[str, Any]]:
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, title, content, created_at FROM canned_responses ORDER BY created_at DESC")
            rows = cur.fetchall() or []
            return [{"id": str(r["id"]), "title": r["title"], "content": r["content"], "createdAt": r["created_at"].isoformat()} for r in rows]


def delete_canned_response(response_id: str) -> bool:
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM canned_responses WHERE id = %s RETURNING id", (response_id,))
            return cur.fetchone() is not None


def list_documents() -> List[Dict[str, Any]]:
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT d.id,
                       d.original_name,
                       d.created_at,
                       d.chunk_size,
                       d.chunk_overlap,
                       d.embedding_model,
                       d.file_size,
                       COALESCE(COUNT(c.id), 0) AS num_chunks
                FROM documents d
                LEFT JOIN document_chunks c ON c.document_id = d.id
                GROUP BY d.id
                ORDER BY d.created_at DESC
                """
            )
            rows = cur.fetchall() or []
            documents: List[Dict[str, Any]] = []
            for row in rows:
                documents.append(
                    {
                        "id": str(row["id"]),
                        "originalName": row["original_name"],
                        "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
                        "numChunks": int(row["num_chunks"] or 0),
                        "chunkSize": row["chunk_size"],
                        "chunkOverlap": row["chunk_overlap"],
                        "embeddingModel": row["embedding_model"],
                        "fileSize": row["file_size"],
                    }
                )
            return documents


def save_document(
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
    if len(chunk_texts) != len(embeddings):
        raise ValueError("Chunks count does not match embeddings count")
    doc_id = uuid4()
    created_at = datetime.utcnow()
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO documents (id, original_name, mime_type, file_size, chunk_size, chunk_overlap, embedding_model, created_at, file_data)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    doc_id,
                    original_name,
                    mime_type,
                    len(binary_data),
                    chunk_size,
                    chunk_overlap,
                    embedding_model,
                    created_at,
                    binary_data,
                ),
            )
            for idx, (text, embedding) in enumerate(zip(chunk_texts, embeddings)):
                cur.execute(
                    """
                    INSERT INTO document_chunks (id, document_id, chunk_index, content, embedding)
                    VALUES (%s, %s, %s, %s, %s::jsonb)
                    """,
                    (uuid4(), doc_id, idx, text, json.dumps(embedding)),
                )
    return {
        "id": str(doc_id),
        "originalName": original_name,
        "createdAt": created_at.isoformat(),
        "numChunks": len(chunk_texts),
        "chunkSize": chunk_size,
        "chunkOverlap": chunk_overlap,
        "embeddingModel": embedding_model,
        "fileSize": len(binary_data),
    }


def get_document_with_chunks(doc_id: str) -> Optional[Dict[str, Any]]:
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, original_name, mime_type, file_size, chunk_size, chunk_overlap, embedding_model, created_at, file_data
                FROM documents
                WHERE id=%s
                """,
                (doc_id,),
            )
            doc_row = cur.fetchone()
            if not doc_row:
                return None
            cur.execute(
                "SELECT id, content, embedding FROM document_chunks WHERE document_id=%s ORDER BY chunk_index ASC",
                (doc_id,),
            )
            rows = cur.fetchall() or []
            chunks = [
                {
                    "id": str(chunk["id"]),
                    "text": chunk["content"],
                    "embedding": chunk["embedding"],
                }
                for chunk in rows
            ]
            metadata = {
                "id": str(doc_row["id"]),
                "originalName": doc_row["original_name"],
                "mimeType": doc_row["mime_type"] or "application/octet-stream",
                "fileSize": doc_row["file_size"],
                "chunkSize": doc_row["chunk_size"],
                "chunkOverlap": doc_row["chunk_overlap"],
                "embeddingModel": doc_row["embedding_model"],
                "createdAt": doc_row["created_at"].isoformat() if doc_row["created_at"] else None,
            }
            return {"metadata": metadata, "file_data": doc_row["file_data"], "chunks": chunks}


def delete_document(doc_id: str) -> bool:
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM documents WHERE id=%s", (doc_id,))
            return cur.rowcount > 0


# ---------------------------------------------------------------------------
# User / Auth
# ---------------------------------------------------------------------------


def create_user(email: str, name: str, password_hash: str, role: str = "agent") -> Dict[str, Any]:
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO users (email, name, password_hash, role)
                VALUES (%s, %s, %s, %s)
                RETURNING id, email, name, role, is_active, created_at
                """,
                (email.lower().strip(), name, password_hash, role),
            )
            return dict(cur.fetchone())


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, name, password_hash, role, is_active FROM users WHERE email=%s",
                (email.lower().strip(),),
            )
            row = cur.fetchone()
            return dict(row) if row else None


def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, name, role, is_active FROM users WHERE id=%s",
                (user_id,),
            )
            row = cur.fetchone()
            return dict(row) if row else None


def count_users() -> int:
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS count FROM users")
            row = cur.fetchone()
            return int(row["count"]) if row else 0


def list_users() -> List[Dict[str, Any]]:
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, name, role, is_active, created_at FROM users ORDER BY created_at ASC"
            )
            rows = cur.fetchall() or []
            return [dict(row) for row in rows]


def update_user(user_id: str, *, name: Optional[str] = None, role: Optional[str] = None) -> Optional[Dict[str, Any]]:
    fields, values = [], []
    if name is not None:
        fields.append("name = %s")
        values.append(name)
    if role is not None:
        fields.append("role = %s")
        values.append(role)
    if not fields:
        return get_user_by_id(user_id)
    fields.append("updated_at = NOW()")
    values.append(user_id)
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE users SET {', '.join(fields)} WHERE id = %s RETURNING id, email, name, role, is_active, created_at",
                values,
            )
            row = cur.fetchone()
            return dict(row) if row else None


def set_user_active(user_id: str, is_active: bool) -> Optional[Dict[str, Any]]:
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE users SET is_active = %s, updated_at = NOW() WHERE id = %s RETURNING id, email, name, role, is_active, created_at",
                (is_active, user_id),
            )
            row = cur.fetchone()
            return dict(row) if row else None


def count_active_admins() -> int:
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS count FROM users WHERE role='admin' AND is_active=TRUE")
            row = cur.fetchone()
            return int(row["count"]) if row else 0


def update_user_password(user_id: str, password_hash: str) -> bool:
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE users SET password_hash = %s, updated_at = NOW() WHERE id = %s",
                (password_hash, user_id),
            )
            return cur.rowcount > 0


# ---------------------------------------------------------------------------
# Refresh tokens
# ---------------------------------------------------------------------------


def create_refresh_token(user_id: str, token_hash: str, expires_at: datetime) -> Dict[str, Any]:
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
                VALUES (%s, %s, %s)
                RETURNING id, user_id, expires_at, created_at
                """,
                (user_id, token_hash, expires_at),
            )
            return dict(cur.fetchone())


def get_refresh_token(token_hash: str) -> Optional[Dict[str, Any]]:
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, user_id, expires_at, revoked
                FROM refresh_tokens
                WHERE token_hash=%s
                """,
                (token_hash,),
            )
            row = cur.fetchone()
            return dict(row) if row else None


def revoke_refresh_token(token_hash: str) -> None:
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE refresh_tokens SET revoked=TRUE WHERE token_hash=%s",
                (token_hash,),
            )


def revoke_all_user_tokens(user_id: str) -> None:
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE refresh_tokens SET revoked=TRUE WHERE user_id=%s",
                (user_id,),
            )


def load_chunk_records() -> List[Dict[str, Any]]:
    with DB_POOL.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT d.id AS doc_id, d.original_name, c.content, c.embedding
                FROM document_chunks c
                JOIN documents d ON d.id = c.document_id
                """
            )
            rows = cur.fetchall() or []
            return [
                {
                    "docId": str(row["doc_id"]),
                    "originalName": row["original_name"],
                    "text": row["content"],
                    "embedding": row["embedding"],
                }
                for row in rows
            ]


__all__ = [
    "DB_POOL",
    "init_db",
    "fetch_member",
    "fetch_member_purchases",
    "insert_conversation_message",
    "fetch_conversation_messages",
    "list_documents",
    "save_document",
    "get_document_with_chunks",
    "delete_document",
    "load_chunk_records",
]
