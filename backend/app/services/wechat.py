"""WeChat access token management, Mini Program code and fallback QR generation."""
import asyncio
import time

import httpx

from app.config import get_settings

_token_cache: dict = {"token": "", "expires_at": 0.0}
_token_lock = asyncio.Lock()


async def get_access_token() -> str:
    settings = get_settings()
    if not settings.wechat_app_id or not settings.wechat_app_secret:
        raise RuntimeError("WeChat credentials not configured (WECHAT_APP_ID / WECHAT_APP_SECRET)")

    async with _token_lock:
        if time.time() < _token_cache["expires_at"] - 300:
            return _token_cache["token"]

        url = "https://api.weixin.qq.com/cgi-bin/token"
        params = {
            "grant_type": "client_credential",
            "appid": settings.wechat_app_id,
            "secret": settings.wechat_app_secret,
        }
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params=params)
            data = resp.json()

        if "errcode" in data and data["errcode"] != 0:
            raise RuntimeError(f"WeChat token error: {data.get('errmsg', data)}")

        token = data.get("access_token")
        expires_in = int(data.get("expires_in", 7200))
        if not token:
            raise RuntimeError("WeChat returned empty access_token")

        _token_cache["token"] = token
        _token_cache["expires_at"] = time.time() + expires_in

    return _token_cache["token"]


async def generate_wxacode(page: str, scene: str, width: int = 430) -> bytes:
    """Return raw PNG bytes of a Mini Program code for the given page and scene."""
    settings = get_settings()
    token = await get_access_token()
    url = f"https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token={token}"
    payload = {
        "scene": scene,
        "page": page,
        "width": width,
        "auto_color": False,
        "line_color": {"r": 0, "g": 0, "b": 0},
        "is_hyaline": False,
        "check_path": False,
        "env_version": settings.wechat_env_version,
    }
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, json=payload)

    ct = resp.headers.get("content-type", "")
    if "json" in ct:
        err = resp.json()
        raise RuntimeError(f"WeChat wxacode error: {err.get('errmsg', err)}")

    return resp.content


async def generate_party_wxacode(join_code: str) -> bytes:
    return await generate_wxacode("pages/party/index", join_code)


async def generate_family_wxacode(invite_code: str) -> bytes:
    return await generate_wxacode("pages/family/join", invite_code)


def generate_plain_qrcode(text: str, size: int = 400) -> bytes:
    """Generate a plain PNG QR code (no WeChat credentials needed)."""
    import io
    import qrcode
    from qrcode.image.pure import PyPNGImage

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(text)
    qr.make(fit=True)

    try:
        from PIL import Image
        img = qr.make_image(fill_color="black", back_color="white")
        img = img.resize((size, size), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()
    except Exception:
        # Pillow 不可用时退回纯 PNG 实现
        img = qr.make_image(image_factory=PyPNGImage)
        buf = io.BytesIO()
        img.save(buf)
        return buf.getvalue()
