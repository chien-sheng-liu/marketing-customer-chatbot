# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Kamee Growth Desk** — an AI-powered customer service prototype for Taiwanese e-commerce. It combines a customer chat portal, an agent copilot console, a knowledge management workspace (RAG), and daily operational insights into a single product demo.

## Development Commands

### Frontend (React + Vite + TypeScript)

```bash
cd frontend && npm install          # install deps
npm run dev:agent                   # Agent portal at http://localhost:3006
npm run dev:customer                # Customer portal at http://localhost:3005
npm run build                       # build both portals (agent + customer)
```

### Backend (Python + FastAPI)

```bash
cd backend && pip install -r requirements.txt
uvicorn main:app --reload --port 4000
```

### Database

```bash
docker compose up postgres          # Postgres on localhost:8002
make up                             # start all services (Customer 3005 / Agent 3006 / Backend 4000 / Postgres 8002)
make down                           # stop all
make logs                           # tail all logs
```

### Environment Setup

```bash
# Backend (required — set CHATGPT_API_KEY)
cd backend && cp .env.local.example .env.local

# Frontend (optional)
cd frontend && cp .env.local.example .env.local
```

## Architecture

### Two Separate Frontend Entry Points

The frontend is one package with **two Vite builds**, each targeting a different persona:

- `frontend/agent/` — Agent portal (port 3006). Contains the copilot dashboard (sentiment, tags, suggested reply, upsell radar), knowledge workspace link, settings panel, and member profile lookup.
- `frontend/customer/` — Customer portal (port 3005). Member/guest selection flow, chat UI, member ID verification against the backend.
- `frontend/App.tsx` — Shared `App` component rendered by both portals; controlled via `mode: 'agent' | 'customer'` prop.
- `frontend/routes/RagWorkspace.tsx` — Document management UI (agent only, `/documents`).
- `frontend/services/apiClient.ts` — All backend calls; reads `VITE_API_BASE_URL` (defaults to `/api`).

### Backend (FastAPI, `backend/main.py`)

Single-file FastAPI app exposing all routes under `/api`. Key responsibilities:

- **`/api/analyze`** — Sends conversation history + top-3 RAG results to OpenAI and returns structured JSON (tags, sentiment, routing, suggested reply, upsell opportunity).
- **`/api/kb-query`** — SOP search against the hardcoded `KNOWLEDGE_BASE` string in `knowledge_base.py`.
- **`/api/report`** — Generates a fixed-scenario daily ops report via OpenAI.
- **`/api/conversations/{id}/messages`** — Persists and retrieves chat history from Postgres.
- **`/api/members/{id}`** and **`/api/members/{id}/purchases`** — Member lookup from the `members` / `purchases` tables.
- **`/api/rag/documents`**, **`/api/rag/search`** — Document upload, chunking, embedding (OpenAI), and cosine-similarity semantic search.
- **`/api/settings/{id}`** — Stores per-conversation agent settings in `backend/storage/agent_settings.json` (file-backed, thread-safe).

### Database (`backend/db.py`)

Uses `psycopg` + `psycopg_pool` (sync connection pool). All DB access goes through functions exported from `db.py`; `rag_store.py` is a thin wrapper that delegates to `db.py`.

Tables auto-created on startup via `init_db()`:
- `members` / `purchases` — seeded with 10 members (M10001–M10010) and 100 randomized purchases on first run.
- `conversation_messages` — full chat history, keyed by `conversation_id`.
- `documents` / `document_chunks` — RAG store; file binaries in `BYTEA`, embeddings in `JSONB`.

### RAG Pipeline

Upload → `extract_document_text()` (supports `.txt/.md/.pdf/.docx/.xlsx`) → `chunk_text()` (configurable size/overlap) → OpenAI embeddings → stored in `document_chunks`. At query time, cosine similarity is computed in-process (no vector DB).

## Key Configuration

| Variable | Default | Purpose |
|---|---|---|
| `CHATGPT_API_KEY` | — | Required; OpenAI API key |
| `OPENAI_MODEL` | `gpt-4o-mini` | Chat completions model |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model |
| `RAG_CHUNK_SIZE` | `800` | Characters per chunk |
| `RAG_CHUNK_OVERLAP` | `200` | Overlap between chunks |
| `DATABASE_URL` | derived from `DB_*` vars | Postgres connection string |
| `VITE_API_BASE_URL` | `/api` | Frontend API base (override when backend is on a different host) |
