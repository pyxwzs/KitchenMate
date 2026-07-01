from fastapi import APIRouter, File, UploadFile

from app.config import get_settings
from app.core.exceptions import not_found
from app.dependencies import CurrentUser, DbSession
from app.schemas.auth import (
    DevLoginRequest,
    LoginResponse,
    UpdateProfileRequest,
    UserResponse,
    WechatLoginRequest,
)
from app.services.auth import dev_login, update_user_profile, upload_user_avatar, wechat_login

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


@router.post("/wechat-login", response_model=LoginResponse)
async def login_with_wechat(body: WechatLoginRequest, db: DbSession) -> LoginResponse:
    user, token = await wechat_login(db, body.code)
    return LoginResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.post("/dev-login", response_model=LoginResponse)
def login_for_development(body: DevLoginRequest, db: DbSession) -> LoginResponse:
    if settings.app_env == "production":
        raise not_found("Endpoint")
    user, token = dev_login(db, body.openid)
    return LoginResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.get("/me", response_model=UserResponse)
def get_me(current_user: CurrentUser) -> UserResponse:
    return UserResponse.model_validate(current_user)


@router.patch("/me", response_model=UserResponse)
def update_me(
    body: UpdateProfileRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> UserResponse:
    user = update_user_profile(db, current_user, body)
    return UserResponse.model_validate(user)


@router.post("/me/avatar", response_model=UserResponse)
async def update_avatar(
    current_user: CurrentUser,
    db: DbSession,
    file: UploadFile = File(...),
) -> UserResponse:
    user = await upload_user_avatar(db, current_user, file)
    return UserResponse.model_validate(user)
