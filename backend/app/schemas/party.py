from datetime import datetime

from pydantic import BaseModel, Field

from app.models.party import PartyStatus


class CreatePartyRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)


class JoinPartyRequest(BaseModel):
    join_code: str = Field(..., min_length=4, max_length=8)


class PartyGuestResponse(BaseModel):
    user_id: int
    display_name: str
    joined_at: datetime


class PartyResponse(BaseModel):
    id: int
    family_id: int
    family_name: str
    host_user_id: int
    host_name: str
    name: str
    join_code: str
    status: PartyStatus
    status_label: str
    guest_count: int
    is_host: bool
    is_guest: bool
    is_member: bool
    share_text: str
    created_at: datetime
    closed_at: datetime | None = None


class PartyDetailResponse(PartyResponse):
    guests: list[PartyGuestResponse]
