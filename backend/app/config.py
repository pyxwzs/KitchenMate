from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def resolve_sqlite_path(path: str) -> str:
    sqlite_path = Path(path)
    if not sqlite_path.is_absolute():
        sqlite_path = BACKEND_ROOT / sqlite_path
    return str(sqlite_path)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "KitchenMate"
    app_env: Literal["development", "staging", "production"] = "development"
    debug: bool = True
    api_v1_prefix: str = "/api/v1"

    # Database
    db_driver: Literal["sqlite", "mysql"] = "sqlite"
    sqlite_path: str = "./data/kitchenmate.db"
    mysql_host: str = "localhost"
    mysql_port: int = 3306
    mysql_user: str = "kitchenmate"
    mysql_password: str = "changeme"
    mysql_database: str = "kitchenmate"
    database_url: str | None = None

    # JWT
    secret_key: str = "change-this-to-a-random-secret-key"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    # WeChat
    wechat_app_id: str = ""
    wechat_app_secret: str = ""
    # wxacode 打开版本：release=正式版 trial=体验版 develop=开发版
    wechat_env_version: Literal["release", "trial", "develop"] = "trial"

    # CORS
    cors_origins: str = "*"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def resolved_sqlite_path(self) -> str:
        return resolve_sqlite_path(self.sqlite_path)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def sqlalchemy_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        if self.db_driver == "mysql":
            return (
                f"mysql+pymysql://{self.mysql_user}:{self.mysql_password}"
                f"@{self.mysql_host}:{self.mysql_port}/{self.mysql_database}"
                f"?charset=utf8mb4"
            )
        return f"sqlite:///{self.resolved_sqlite_path}"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_sqlite(self) -> bool:
        return self.sqlalchemy_database_url.startswith("sqlite")

    @computed_field  # type: ignore[prop-decorator]
    @property
    def cors_origin_list(self) -> list[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
