from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import ORMBase

FamilyRolePublic = Literal["admin", "member"]


class CreateFamilyRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)


class JoinFamilyRequest(BaseModel):
    invite_code: str = Field(..., min_length=4, max_length=8)


class UpdateMemberRoleRequest(BaseModel):
    role: FamilyRolePublic


class MemberUserResponse(ORMBase):
    id: int
    nickname: str | None = None
    real_name: str | None = None
    avatar_url: str | None = None


class FamilyMemberResponse(ORMBase):
    id: int
    user_id: int
    role: FamilyRolePublic
    is_owner: bool = False
    user: MemberUserResponse


class FamilyResponse(ORMBase):
    id: int
    name: str
    invite_code: str
    created_by: int
    my_role: FamilyRolePublic | None = None
    my_is_owner: bool = False
    member_count: int = 0


from app.schemas.menu import CookInfo


class FamilyDetailResponse(FamilyResponse):
    members: list[FamilyMemberResponse] = []
    cook: CookInfo | None = None
    cooks: list[CookInfo] = []
    menu_members: list[CookInfo] = []


class InviteInfoResponse(BaseModel):
    family_id: int
    family_name: str
    invite_code: str
    share_text: str
