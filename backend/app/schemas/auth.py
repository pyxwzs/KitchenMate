from pydantic import BaseModel, Field

from app.schemas.common import ORMBase


class WechatLoginRequest(BaseModel):
    code: str = Field(..., min_length=1, description="wx.login() 返回的 code")


class DevLoginRequest(BaseModel):
    openid: str = Field(default="dev-user-001", min_length=1, description="开发环境模拟 openid")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(ORMBase):
    id: int
    openid: str
    nickname: str | None = None
    real_name: str | None = None
    avatar_url: str | None = None
    phone: str | None = None


class UpdateProfileRequest(BaseModel):
    nickname: str | None = Field(default=None, max_length=64)
    real_name: str | None = Field(default=None, max_length=64)
    avatar_url: str | None = Field(default=None, max_length=512)
    phone: str | None = Field(default=None, max_length=20)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
