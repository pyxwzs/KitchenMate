from fastapi import HTTPException, status


class AppException(HTTPException):
    def __init__(self, status_code: int, detail: str, code: str | None = None):
        super().__init__(
            status_code=status_code,
            detail={"message": detail, "code": code or "error"},
        )


def not_found(resource: str = "资源") -> AppException:
    if any(marker in resource for marker in ("不存在", "无效", "未找到", "失败")):
        detail = resource
    else:
        detail = f"{resource}不存在"
    return AppException(status.HTTP_404_NOT_FOUND, detail, "not_found")


def unauthorized(detail: str = "Not authenticated") -> AppException:
    return AppException(status.HTTP_401_UNAUTHORIZED, detail, "unauthorized")


def forbidden(detail: str = "Forbidden") -> AppException:
    return AppException(status.HTTP_403_FORBIDDEN, detail, "forbidden")


def bad_request(detail: str) -> AppException:
    return AppException(status.HTTP_400_BAD_REQUEST, detail, "bad_request")
