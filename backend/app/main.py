import sys
from pathlib import Path

# 支持 IDE 直接运行 `python app/main.py`
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.config import BACKEND_ROOT, get_settings
from app.db_migrate import run_migrations

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_migrations()
    if settings.is_sqlite:
        db_path = Path(settings.resolved_sqlite_path)
        db_path.parent.mkdir(parents=True, exist_ok=True)
    uploads_dir = BACKEND_ROOT / "data" / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        debug=settings.debug,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix=settings.api_v1_prefix)
    uploads_dir = BACKEND_ROOT / "data" / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

    @app.get("/", tags=["root"])
    def root():
        return {"message": f"Welcome to {settings.app_name} API"}

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
    )
