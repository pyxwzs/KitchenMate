from pydantic import BaseModel, Field

from app.models.family import FamilyRole
from app.schemas.common import ORMBase


class CreateFamilyRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)


class JoinFamilyRequest(BaseModel):
    invite_code: str = Field(..., min_length=4, max_length=8)


class UpdateMemberRoleRequest(BaseModel):
    role: FamilyRole


class MemberUserResponse(ORMBase):
    id: int
    nickname: str | None = None
    real_name: str | None = None
    avatar_url: str | None = None


class FamilyMemberResponse(ORMBase):
    id: int
    user_id: int
    role: FamilyRole
    user: MemberUserResponse


class FamilyResponse(ORMBase):
    id: int
    name: str
    invite_code: str
    created_by: int
    my_role: FamilyRole | None = None
    member_count: int = 0


from app.schemas.menu import CookInfo


class FamilyDetailResponse(FamilyResponse):
    members: list[FamilyMemberResponse] = []
    cook: CookInfo | None = None


class InviteInfoResponse(BaseModel):
    family_id: int
    family_name: str
    invite_code: str
    share_text: str
