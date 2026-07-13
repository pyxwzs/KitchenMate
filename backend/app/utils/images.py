import hashlib
from pathlib import Path

from fastapi import UploadFile

from app.config import BACKEND_ROOT
from app.core.exceptions import bad_request

UPLOAD_DIR = BACKEND_ROOT / "data" / "uploads"
MAX_IMAGE_SIZE = 10 * 1024 * 1024

AVATAR_KEY = "avatar"
DISHES_SUBDIR = "dishes"


def md5_name(key: str) -> str:
    return hashlib.md5(key.encode()).hexdigest()


def user_dir_name(openid: str) -> str:
    return md5_name(openid)


def avatar_base_name() -> str:
    return md5_name(AVATAR_KEY)


def dish_base_name(dish_id: int) -> str:
    return md5_name(str(dish_id))


def ensure_user_dir(openid: str) -> Path:
    user_dir = UPLOAD_DIR / user_dir_name(openid)
    user_dir.mkdir(parents=True, exist_ok=True)
    (user_dir / DISHES_SUBDIR).mkdir(exist_ok=True)
    return user_dir


def _image_suffix(content_type: str, filename: str) -> str | None:
    content_type = content_type or ""
    filename_lower = (filename or "").lower()
    if content_type in {"image/jpeg", "image/jpg"} or filename_lower.endswith((".jpg", ".jpeg")):
        return ".jpg"
    if content_type == "image/png" or filename_lower.endswith(".png"):
        return ".png"
    if content_type == "image/webp" or filename_lower.endswith(".webp"):
        return ".webp"
    if content_type == "image/gif" or filename_lower.endswith(".gif"):
        return ".gif"
    if content_type in {"image/jpeg", "image/png", "image/webp", "image/gif", "application/octet-stream"}:
        return ".jpg"
    return None


async def _read_image(file: UploadFile) -> tuple[bytes, str]:
    suffix = _image_suffix(file.content_type or "", file.filename or "")
    if suffix is None:
        raise bad_request("Unsupported image type")

    content = await file.read()
    if not content:
        raise bad_request("Empty file")
    if len(content) > MAX_IMAGE_SIZE:
        raise bad_request("File too large (max 5MB)")
    return content, suffix


def _remove_same_base_files(directory: Path, base_name: str, suffix: str) -> None:
    for ext in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
        if ext == suffix:
            continue
        candidate = directory / f"{base_name}{ext}"
        if candidate.is_file():
            candidate.unlink()


def _save_named_image(directory: Path, base_name: str, suffix: str, content: bytes) -> str:
    directory.mkdir(parents=True, exist_ok=True)
    _remove_same_base_files(directory, base_name, suffix)
    filename = f"{base_name}{suffix}"
    (directory / filename).write_bytes(content)
    return filename


def upload_relative_path(openid: str, *parts: str) -> str:
    return "/".join([user_dir_name(openid), *parts])


async def save_user_avatar(file: UploadFile, openid: str) -> str:
    content, suffix = await _read_image(file)
    user_dir = ensure_user_dir(openid)
    filename = _save_named_image(user_dir, avatar_base_name(), suffix, content)
    rel = upload_relative_path(openid, filename)
    return f"/uploads/{rel}"


async def save_dish_image(file: UploadFile, openid: str, dish_id: int) -> str:
    content, suffix = await _read_image(file)
    dish_dir = ensure_user_dir(openid) / DISHES_SUBDIR
    filename = _save_named_image(dish_dir, dish_base_name(dish_id), suffix, content)
    rel = upload_relative_path(openid, DISHES_SUBDIR, filename)
    return f"/uploads/{rel}"
