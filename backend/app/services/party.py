from datetime import UTC, datetime

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import bad_request, forbidden, not_found
from app.models.family import Family, FamilyMember, FamilyRole
from app.models.party import Party, PartyGuest, PartyStatus
from app.models.user import User
from app.services.family import (
    generate_invite_code,
    get_member,
    require_admin,
    user_display_name,
)
from app.services import order as order_service

PARTY_STATUS_LABELS = {
    PartyStatus.ACTIVE: "进行中",
    PartyStatus.CLOSED: "已结束",
}


def is_party_guest(db: Session, family_id: int, user_id: int) -> PartyGuest | None:
    return (
        db.query(PartyGuest)
        .join(Party, Party.id == PartyGuest.party_id)
        .filter(
            PartyGuest.user_id == user_id,
            Party.family_id == family_id,
            Party.status == PartyStatus.ACTIVE,
        )
        .first()
    )


def create_unique_party_code(db: Session) -> str:
    for _ in range(10):
        code = generate_invite_code()
        exists = db.query(Party.id).filter(Party.join_code == code).first()
        if not exists:
            return code
    raise bad_request("生成聚会码失败")


def is_active_party_host(db: Session, family_id: int, user_id: int) -> bool:
    return (
        db.query(Party.id)
        .filter(
            Party.family_id == family_id,
            Party.host_user_id == user_id,
            Party.status == PartyStatus.ACTIVE,
        )
        .first()
        is not None
    )


def has_family_access(db: Session, family_id: int, user_id: int) -> bool:
    if get_member(db, family_id, user_id):
        return True
    if is_party_guest(db, family_id, user_id) is not None:
        return True
    return is_active_party_host(db, family_id, user_id)


def require_family_access(db: Session, family_id: int, user_id: int) -> None:
    if not has_family_access(db, family_id, user_id):
        raise forbidden("您没有权限访问该家庭")


def _get_party(db: Session, party_id: int) -> Party:
    party = (
        db.query(Party)
        .options(joinedload(Party.guests).joinedload(PartyGuest.user))
        .filter(Party.id == party_id)
        .first()
    )
    if not party:
        raise not_found("聚会")
    return party


def _serialize_party(
    db: Session,
    party: Party,
    viewer_id: int,
    family: Family | None = None,
) -> dict:
    if family is None:
        family = db.get(Family, party.family_id)
    host = db.get(User, party.host_user_id)
    member = get_member(db, party.family_id, viewer_id)
    guest = next((g for g in party.guests if g.user_id == viewer_id), None)

    guest_items = []
    for g in party.guests:
        guest_items.append(
            {
                "user_id": g.user_id,
                "display_name": user_display_name(g.user),
                "joined_at": g.created_at,
            }
        )

    share_text = (
        f"邀请你参加「{party.name}」聚会，"
        f"打开懒大厨个人菜单小程序 → 聚会模式，输入聚会码 {party.join_code} 即可加入点餐。"
    )

    return {
        "id": party.id,
        "family_id": party.family_id,
        "family_name": family.name if family else "",
        "host_user_id": party.host_user_id,
        "host_name": user_display_name(host) if host else "",
        "name": party.name,
        "join_code": party.join_code,
        "status": party.status,
        "status_label": PARTY_STATUS_LABELS[party.status],
        "guest_count": len(party.guests),
        "is_host": party.host_user_id == viewer_id,
        "is_guest": guest is not None,
        "is_member": member is not None,
        "share_text": share_text,
        "created_at": party.created_at,
        "closed_at": party.closed_at,
        "guests": guest_items,
    }


def get_active_party(db: Session, family_id: int, viewer_id: int) -> dict | None:
    require_family_access(db, family_id, viewer_id)
    party = (
        db.query(Party)
        .options(joinedload(Party.guests).joinedload(PartyGuest.user))
        .filter(Party.family_id == family_id, Party.status == PartyStatus.ACTIVE)
        .order_by(Party.created_at.desc())
        .first()
    )
    if not party:
        return None
    return _serialize_party(db, party, viewer_id)


def start_party(db: Session, family_id: int, host_id: int, name: str) -> dict:
    require_admin(db, family_id, host_id)

    existing = (
        db.query(Party)
        .filter(Party.family_id == family_id, Party.status == PartyStatus.ACTIVE)
        .first()
    )
    if existing:
        raise bad_request("该家庭已有进行中的聚会")

    party = Party(
        family_id=family_id,
        host_user_id=host_id,
        name=name.strip(),
        join_code=create_unique_party_code(db),
        status=PartyStatus.ACTIVE,
    )
    db.add(party)
    db.commit()
    db.refresh(party)
    party = _get_party(db, party.id)
    return _serialize_party(db, party, host_id)


def ensure_party_guest(db: Session, party: Party, user_id: int) -> bool:
    """Record a party participant. Host is not counted as a guest."""
    if party.host_user_id == user_id:
        return False

    existing = (
        db.query(PartyGuest)
        .filter(PartyGuest.party_id == party.id, PartyGuest.user_id == user_id)
        .first()
    )
    if existing:
        return False

    db.add(PartyGuest(party_id=party.id, user_id=user_id))
    db.commit()
    return True


def join_party(db: Session, user: User, join_code: str) -> dict:
    code = join_code.strip().upper()
    party = (
        db.query(Party)
        .options(joinedload(Party.guests).joinedload(PartyGuest.user))
        .filter(Party.join_code == code, Party.status == PartyStatus.ACTIVE)
        .first()
    )
    if not party:
        raise bad_request("聚会码无效或聚会已结束")

    ensure_party_guest(db, party, user.id)
    party = _get_party(db, party.id)
    return _serialize_party(db, party, user.id)


def close_party(db: Session, party_id: int, operator_id: int) -> dict:
    party = _get_party(db, party_id)
    member = get_member(db, party.family_id, operator_id)
    if (not member or member.role != FamilyRole.ADMIN) and party.host_user_id != operator_id:
        raise forbidden("只有聚会发起者或家庭管理员可以结束聚会")

    if party.status == PartyStatus.CLOSED:
        raise bad_request("聚会已结束")

    try:
        order_service.lock_session(db, party.family_id, operator_id)
    except Exception:
        pass

    party.status = PartyStatus.CLOSED
    party.closed_at = datetime.now(UTC)
    db.commit()
    party = _get_party(db, party.id)
    return _serialize_party(db, party, operator_id)


def get_my_active_party(db: Session, user_id: int) -> dict | None:
    guest = (
        db.query(PartyGuest)
        .join(Party, Party.id == PartyGuest.party_id)
        .filter(PartyGuest.user_id == user_id, Party.status == PartyStatus.ACTIVE)
        .order_by(PartyGuest.created_at.desc())
        .first()
    )
    if guest:
        party = _get_party(db, guest.party_id)
        return _serialize_party(db, party, user_id)

    hosted = (
        db.query(Party)
        .options(joinedload(Party.guests).joinedload(PartyGuest.user))
        .filter(Party.host_user_id == user_id, Party.status == PartyStatus.ACTIVE)
        .order_by(Party.created_at.desc())
        .first()
    )
    if hosted:
        return _serialize_party(db, hosted, user_id)

    return None
