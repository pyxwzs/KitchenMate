from fastapi import APIRouter
from sqlalchemy import text

from app.config import get_settings
from app.dependencies import DbSession
from app.schemas.common import HealthResponse

router = APIRouter(tags=["health"])
settings = get_settings()


@router.get("/health", response_model=HealthResponse)
def health_check(db: DbSession) -> HealthResponse:
    db.execute(text("SELECT 1"))
    return HealthResponse(
        status="ok",
        app=settings.app_name,
        env=settings.app_env,
        database=settings.db_driver,
    )
