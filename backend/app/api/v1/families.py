from fastapi import APIRouter
from fastapi.responses import Response

from app.core.exceptions import bad_request
from app.dependencies import CurrentUser, DbSession
from app.models.family import FamilyMember
from app.schemas.family import (
    CreateFamilyRequest,
    FamilyDetailResponse,
    FamilyResponse,
    InviteInfoResponse,
    JoinFamilyRequest,
    UpdateMemberRoleRequest,
)
from app.services import family as family_service
from app.services import wechat as wechat_service

router = APIRouter(prefix="/families", tags=["families"])


@router.post("", response_model=FamilyResponse)
def create_family(body: CreateFamilyRequest, current_user: CurrentUser, db: DbSession) -> dict:
    family = family_service.create_family(db, current_user, body.name)
    return family_service.build_family_response(family, current_user.id, 1)


@router.get("", response_model=list[FamilyResponse])
def list_families(current_user: CurrentUser, db: DbSession) -> list[dict]:
    return family_service.list_user_families(db, current_user.id)


@router.post("/join", response_model=FamilyResponse)
def join_family(body: JoinFamilyRequest, current_user: CurrentUser, db: DbSession) -> dict:
    family = family_service.join_family(db, current_user, body.invite_code)
    member_count = db.query(FamilyMember).filter(FamilyMember.family_id == family.id).count()
    return family_service.build_family_response(family, current_user.id, member_count)


@router.get("/{family_id}", response_model=FamilyDetailResponse)
def get_family(family_id: int, current_user: CurrentUser, db: DbSession) -> dict:
    return family_service.get_family_detail(db, family_id, current_user.id)


@router.get("/{family_id}/invite", response_model=InviteInfoResponse)
def get_invite_info(family_id: int, current_user: CurrentUser, db: DbSession) -> dict:
    return family_service.get_invite_info(db, family_id, current_user.id)


@router.get("/{family_id}/wxacode")
async def get_family_wxacode(
    family_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> Response:
    """Return a QR code PNG for inviting members to join the family."""
    invite = family_service.get_invite_info(db, family_id, current_user.id)

    try:
        image_bytes = await wechat_service.generate_family_wxacode(invite["invite_code"])
        return Response(
            content=image_bytes,
            media_type="image/png",
            headers={"X-QR-Type": "wxacode"},
        )
    except RuntimeError:
        pass

    try:
        qr_text = f"kitchenmate://family/{invite['invite_code']}"
        image_bytes = wechat_service.generate_plain_qrcode(qr_text)
        return Response(
            content=image_bytes,
            media_type="image/png",
            headers={"X-QR-Type": "plain"},
        )
    except Exception as exc:
        raise bad_request(f"QR code generation failed: {exc}") from exc


@router.delete("/{family_id}")
def delete_family(family_id: int, current_user: CurrentUser, db: DbSession):
    family_service.delete_family(db, family_id, current_user.id)
    return {"ok": True}


@router.post("/{family_id}/leave")
def leave_family(family_id: int, current_user: CurrentUser, db: DbSession):
    family_service.leave_family(db, family_id, current_user.id)
    return {"ok": True}


@router.delete("/{family_id}/members/{member_id}")
def remove_member(
    family_id: int,
    member_id: int,
    current_user: CurrentUser,
    db: DbSession,
):
    family_service.remove_member(db, family_id, current_user.id, member_id)
    return {"ok": True}


@router.patch("/{family_id}/members/{member_id}")
def update_member_role(
    family_id: int,
    member_id: int,
    body: UpdateMemberRoleRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    member = family_service.update_member_role(
        db, family_id, current_user.id, member_id, body.role
    )
    return {"id": member.id, "role": family_service.role_to_public(member.role)}
