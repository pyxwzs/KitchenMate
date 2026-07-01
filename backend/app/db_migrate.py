from pathlib import Path

from alembic import command
from alembic.config import Config

from app.config import BACKEND_ROOT, get_settings


def run_migrations() -> None:
    settings = get_settings()
    if not settings.is_sqlite:
        return

    db_path = Path(settings.resolved_sqlite_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    alembic_cfg = Config(str(BACKEND_ROOT / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    alembic_cfg.set_main_option("sqlalchemy.url", settings.sqlalchemy_database_url)
    command.upgrade(alembic_cfg, "head")
