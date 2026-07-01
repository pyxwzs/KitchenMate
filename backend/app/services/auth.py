import httpx
from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.exceptions import bad_request
from app.core.security import create_access_token
from app.models.user import User
from app.schemas.auth import UpdateProfileRequest
from app.utils.images import ensure_user_dir, save_user_avatar

settings = get_settings()


async def exchange_wechat_code(code: str) -> dict:
    """Exchange wx.login code for openid via WeChat API."""
    if not settings.wechat_app_id or not settings.wechat_app_secret:
        raise bad_request(
            "WeChat credentials not configured. Set WECHAT_APP_ID and WECHAT_APP_SECRET."
        )

    url = "https://api.weixin.qq.com/sns/jscode2session"
    params = {
        "appid": settings.wechat_app_id,
        "secret": settings.wechat_app_secret,
        "js_code": code,
        "grant_type": "authorization_code",
    }

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(url, params=params)
        data = response.json()

    if "errcode" in data and data["errcode"] != 0:
        raise bad_request(f"WeChat login failed: {data.get('errmsg', 'unknown error')}")

    openid = data.get("openid")
    if not openid:
        raise bad_request("WeChat login failed: missing openid")

    return data


def get_or_create_user(db: Session, openid: str) -> User:
    user = db.query(User).filter(User.openid == openid).first()
    if user:
        return user

    user = User(openid=openid)
    db.add(user)
    db.commit()
    db.refresh(user)
    ensure_user_dir(openid)
    return user


async def wechat_login(db: Session, code: str) -> tuple[User, str]:
    wechat_data = await exchange_wechat_code(code)
    user = get_or_create_user(db, wechat_data["openid"])
    token = create_access_token(user.id)
    return user, token


def dev_login(db: Session, openid: str) -> tuple[User, str]:
    user = get_or_create_user(db, openid)
    token = create_access_token(user.id)
    return user, token


def update_user_profile(db: Session, user: User, body: UpdateProfileRequest) -> User:
    if body.nickname is not None:
        user.nickname = body.nickname.strip() or None
    if body.real_name is not None:
        user.real_name = body.real_name.strip() or None
    if body.avatar_url is not None:
        user.avatar_url = body.avatar_url.strip() or None
    if body.phone is not None:
        user.phone = body.phone.strip() or None
    db.commit()
    db.refresh(user)
    return user


async def upload_user_avatar(db: Session, user: User, file: UploadFile) -> User:
    user.avatar_url = await save_user_avatar(file, user.openid)
    db.commit()
    db.refresh(user)
    return user
