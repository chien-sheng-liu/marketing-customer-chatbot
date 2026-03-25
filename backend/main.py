"""Application entry point.

Responsibilities:
- Load environment variables
- Configure logging
- Create FastAPI app and attach CORS middleware
- Mount all routers under /api
"""
from __future__ import annotations

import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import count_users, create_user, init_db
from routers.analysis import router as analysis_router
from routers.auth import router as auth_router
from routers.canned_responses import router as canned_router
from routers.conversation import router as conversation_router
from routers.member import router as member_router
from routers.rag import router as rag_router
from routers.settings_router import router as settings_router
from routers.users import router as users_router
from services.auth_service import hash_password

# ---------------------------------------------------------------------------
# Environment & logging
# ---------------------------------------------------------------------------

load_dotenv(dotenv_path=".env.local")
load_dotenv()

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s [backend] %(message)s",
)
logger = logging.getLogger("marketing_tools.main")

PORT = int(os.getenv("PORT", "4000"))
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "")

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="Customer Service Bot API", version="1.0.0")

origins = [o.strip() for o in CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

init_db()
logger.info("Database initialised")

# Seed first admin account if no users exist yet
_DEFAULT_ADMIN_EMAIL = "admin@example.com"
_DEFAULT_ADMIN_PASSWORD = "changeme123"

if count_users() == 0:
    create_user(
        email=_DEFAULT_ADMIN_EMAIL,
        name="Admin",
        password_hash=hash_password(_DEFAULT_ADMIN_PASSWORD),
        role="admin",
    )
    logger.info("Seeded initial admin user: %s (請登入後立即修改密碼)", _DEFAULT_ADMIN_EMAIL)
else:
    logger.debug("Users table already seeded, skipping admin seed")

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

app.include_router(auth_router, prefix="/api/auth")
app.include_router(analysis_router, prefix="/api")
app.include_router(rag_router, prefix="/api/rag")
app.include_router(settings_router, prefix="/api/settings")
app.include_router(conversation_router, prefix="/api/conversations")
app.include_router(canned_router, prefix="/api/canned-responses")
app.include_router(member_router, prefix="/api/members")
app.include_router(users_router, prefix="/api/users")


@app.get("/health")
def health_check():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Dev server
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
