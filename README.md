# Kamee Growth Desk — Productizing the AI 客戶體驗

Kamee Growth Desk 把原本 demo 型的客服範例升級成一個可端到端體驗的產品原型。它把 AI 聊天、知識管理、與營運洞察包成單一介面，讓團隊可以直接想像上線後的樣子，而不只是技術展示。

## Product Pillars

1. **Conversational Inbox** — Customer portal + Agent side-by-side view，以真實會話流程示範會員辨識、AI 輔助建議、與自動升級/轉接機制。
2. **Copilot Console** — Suggested replies、情緒/意圖標記、Upsell radar、風險警示都集中在右側 dashboard，對外看起來就是產品功能，而非工程介面。
3. **Knowledge Workspace** — 內建文件管理與 RAG 搜尋，示範 SOP / FAQ 如何被即時上傳並轉成向量供 Copilot 尋答。
4. **运营 Insights** — 「每日營運洞察」報告把 AI 生的分析包裝成產品模組，展示決策層的價值。

## Experience Walkthrough

- **Customer** 輸入會員編號即可進線，系統提示品牌式 opening，並於後台顯示驗證狀態。
- **Agent** 在同一視窗內收到 AI Copilot 的洞察、建議話術、轉接建議與知識搜尋結果。
- **Ops / KM** 在 `/documents` 的 Knowledge Workspace 上傳 SOP，立即可以被語意搜尋與 Copilot 使用。

## Run Locally

**Prerequisites:** Node.js 18+、Python 3.10+。

1. Install frontend deps: `cd frontend && npm install`
2. Install backend deps: `cd backend && pip install -r requirements.txt`
3. Configure env files:
   - Frontend (optional override): `cd frontend && cp .env.local.example .env.local`
   - Backend (required): `cd backend && cp .env.local.example .env.local` then set `CHATGPT_API_KEY`
4. Start backend API: `cd backend && uvicorn main:app --reload --port 4000`
5. Launch portals (individual terminals):
   - Customer portal (`http://localhost:3005`): `cd frontend && npm run dev:customer`
   - Agent portal (`http://localhost:3006`): `cd frontend && npm run dev:agent`

Frontend calls the backend via `/api`. Override with `VITE_API_BASE_URL` in `frontend/.env.local` if you host the API elsewhere.

## Knowledge Workspace (Documents + RAG)

訪問 `http://localhost:3006/documents` 或在 Agent 介面點 **文件管理**。這個模組呈現產品級的文件庫體驗：

- 支援 `.txt`, `.md`, `.markdown`, `.pdf`, `.docx`, `.xlsx`（單檔 20 MB 以內會自動 chunk 與 embedding）。
- 會自動 chunk + embedding，資料存放在 `backend/storage/`（Docker 會以 volume 保存）。
- 介面提供上傳、下載、刪除、語意搜尋結果列表。
- API（前綴 `/api`）
  - `GET /rag/documents` — 列出文件。
  - `POST /rag/documents` — 上傳並啟動 chunk/embedding 流程。
  - `GET /rag/documents/:id/download` — 下載原檔。
  - `DELETE /rag/documents/:id` — 刪除文件與其 embedding。
  - `POST /rag/search` — `{"query": string, "topK": number}` 語意搜尋。
- 可在 `backend/.env.local` 調整：`OPENAI_EMBEDDING_MODEL`, `RAG_CHUNK_SIZE`, `RAG_CHUNK_OVERLAP`, `RAG_MAX_FILE_BYTES`。

## Run with Docker + Make

1. 複製並設定 env（特別是 `backend/.env.local` 內的 `CHATGPT_API_KEY`）。
2. 啟動前後端容器：`make up`（Customer 3005 / Agent 3006）。
3. 需要看 log：`make logs`
4. 停止並清除：`make down`

Environment overrides：
- `CUSTOMER_PORT=3100 make up`
- `AGENT_PORT=3200 make up`
- `BACKEND_PORT=4100 make up`
