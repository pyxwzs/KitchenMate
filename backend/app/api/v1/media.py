from fastapi import APIRouter
from fastapi.responses import FileResponse

from app.config import BACKEND_ROOT
from app.core.exceptions import not_found

router = APIRouter(prefix="/media", tags=["media"])

UPLOAD_DIR = BACKEND_ROOT / "data" / "uploads"


@router.get("/{filepath:path}")
def get_upload(filepath: str) -> FileResponse:
    if not filepath or ".." in filepath or filepath.startswith("."):
        raise not_found("File")

    file_path = (UPLOAD_DIR / filepath).resolve()
    if not str(file_path).startswith(str(UPLOAD_DIR.resolve())):
        raise not_found("File")
    if not file_path.is_file():
        raise not_found("File")

    media_type = "image/jpeg"
    lower = filepath.lower()
    if lower.endswith(".png"):
        media_type = "image/png"
    elif lower.endswith(".webp"):
        media_type = "image/webp"
    elif lower.endswith(".gif"):
        media_type = "image/gif"

    return FileResponse(file_path, media_type=media_type)
