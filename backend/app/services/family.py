import secrets
import string

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import bad_request, forbidden, not_found
from app.models.family import Family, FamilyMember, FamilyRole
from app.models.order import Order, OrderItem
from app.models.party import Party, PartyGuest
from app.models.user import User

INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def user_display_name(user: User) -> str:
    return user.real_name or user.nickname or f"用户{user.id}"


def get_family_cook(db: Session, family_id: int) -> User:
    family = db.get(Family, family_id)
    if not family:
        raise not_found("Family")

    creator_member = get_member(db, family_id, family.created_by)
    if creator_member and creator_member.role == FamilyRole.ADMIN:
        cook = db.get(User, family.created_by)
        if cook:
            return cook

    admin_member = (
        db.query(FamilyMember)
        .filter(
            FamilyMember.family_id == family_id,
            FamilyMember.role == FamilyRole.ADMIN,
        )
        .order_by(FamilyMember.id.asc())
        .first()
    )
    if not admin_member:
        raise bad_request("Family has no admin cook")

    cook = db.get(User, admin_member.user_id)
    if not cook:
        raise not_found("Cook")
    return cook


def generate_invite_code(length: int = 6) -> str:
    return "".join(secrets.choice(INVITE_ALPHABET) for _ in range(length))


def create_unique_invite_code(db: Session) -> str:
    for _ in range(10):
        code = generate_invite_code()
        exists = db.query(Family.id).filter(Family.invite_code == code).first()
        if not exists:
            return code
    raise bad_request("Failed to generate invite code")


def get_member(db: Session, family_id: int, user_id: int) -> FamilyMember | None:
    return (
        db.query(FamilyMember)
        .filter(FamilyMember.family_id == family_id, FamilyMember.user_id == user_id)
        .first()
    )


def require_family_access(db: Session, family_id: int, user_id: int) -> None:
    from app.services.party import has_family_access

    if not has_family_access(db, family_id, user_id):
        raise forbidden("You do not have access to this family")


def require_member(db: Session, family_id: int, user_id: int) -> FamilyMember:
    member = get_member(db, family_id, user_id)
    if not member:
        raise forbidden("You are not a member of this family")
    return member


def require_admin(db: Session, family_id: int, user_id: int) -> FamilyMember:
    member = require_member(db, family_id, user_id)
    if member.role != FamilyRole.ADMIN:
        raise forbidden("Admin permission required")
    return member


def build_family_response(family: Family, user_id: int | None, member_count: int) -> dict:
    my_role = None
    if user_id is not None:
        for member in family.members:
            if member.user_id == user_id:
                my_role = member.role
                break
    return {
        "id": family.id,
        "name": family.name,
        "invite_code": family.invite_code,
        "created_by": family.created_by,
        "my_role": my_role,
        "member_count": member_count,
    }


def create_family(db: Session, user: User, name: str) -> Family:
    family = Family(
        name=name.strip(),
        invite_code=create_unique_invite_code(db),
        created_by=user.id,
    )
    db.add(family)
    db.flush()

    admin_member = FamilyMember(
        family_id=family.id,
        user_id=user.id,
        role=FamilyRole.ADMIN,
    )
    db.add(admin_member)
    db.commit()
    db.refresh(family)
    return family


def list_user_families(db: Session, user_id: int) -> list[dict]:
    rows = (
        db.query(Family, func.count(FamilyMember.id))
        .join(FamilyMember, FamilyMember.family_id == Family.id)
        .filter(FamilyMember.user_id == user_id)
        .group_by(Family.id)
        .order_by(Family.id.desc())
        .all()
    )
    result = []
    for family, member_count in rows:
        family.members = (
            db.query(FamilyMember).filter(FamilyMember.family_id == family.id).all()
        )
        result.append(build_family_response(family, user_id, member_count))
    return result


def get_family_detail(db: Session, family_id: int, user_id: int) -> dict:
    require_member(db, family_id, user_id)

    family = db.get(Family, family_id)
    if not family:
        raise not_found("Family")

    members = (
        db.query(FamilyMember)
        .options(joinedload(FamilyMember.user))
        .filter(FamilyMember.family_id == family_id)
        .order_by(FamilyMember.id.asc())
        .all()
    )

    member_items = []
    for member in members:
        u = member.user
        member_items.append(
            {
                "id": member.id,
                "user_id": member.user_id,
                "role": member.role,
                "user": {
                    "id": u.id,
                    "nickname": u.nickname,
                    "real_name": u.real_name,
                    "avatar_url": u.avatar_url,
                },
            }
        )

    family.members = members
    data = build_family_response(family, user_id, len(members))
    data["members"] = member_items
    cook = get_family_cook(db, family_id)
    data["cook"] = {
        "id": cook.id,
        "display_name": user_display_name(cook),
    }
    return data


def get_invite_info(db: Session, family_id: int, user_id: int) -> dict:
    member = require_member(db, family_id, user_id)
    family = db.get(Family, family_id)
    if not family:
        raise not_found("Family")

    share_text = (
        f"邀请你加入「{family.name}」家庭，"
        f"打开懒大厨个人菜单小程序，输入邀请码 {family.invite_code} 即可加入。"
    )
    return {
        "family_id": family.id,
        "family_name": family.name,
        "invite_code": family.invite_code,
        "share_text": share_text,
    }


def join_family(db: Session, user: User, invite_code: str) -> Family:
    code = invite_code.strip().upper()
    family = db.query(Family).filter(Family.invite_code == code).first()
    if not family:
        raise not_found("Invite code")

    existing = get_member(db, family.id, user.id)
    if existing:
        raise bad_request("You are already a member of this family")

    member = FamilyMember(
        family_id=family.id,
        user_id=user.id,
        role=FamilyRole.DINER,
    )
    db.add(member)
    db.commit()
    db.refresh(family)
    return family


def update_member_role(
    db: Session,
    family_id: int,
    operator_id: int,
    member_id: int,
    role: FamilyRole,
) -> FamilyMember:
    require_admin(db, family_id, operator_id)

    target = db.get(FamilyMember, member_id)
    if not target or target.family_id != family_id:
        raise not_found("Member")

    if target.role == FamilyRole.ADMIN and role != FamilyRole.ADMIN:
        _ensure_not_last_admin(db, family_id, target)

    target.role = role
    db.commit()
    db.refresh(target)
    return target


def _ensure_not_last_admin(db: Session, family_id: int, member: FamilyMember) -> None:
    if member.role != FamilyRole.ADMIN:
        return
    admin_count = (
        db.query(func.count(FamilyMember.id))
        .filter(
            FamilyMember.family_id == family_id,
            FamilyMember.role == FamilyRole.ADMIN,
        )
        .scalar()
    )
    if admin_count <= 1:
        raise bad_request("不能移除最后一位管理员")


def leave_family(db: Session, family_id: int, user_id: int) -> None:
    member = require_member(db, family_id, user_id)
    _ensure_not_last_admin(db, family_id, member)
    db.delete(member)
    db.commit()


def remove_member(db: Session, family_id: int, operator_id: int, member_id: int) -> None:
    require_admin(db, family_id, operator_id)

    target = db.get(FamilyMember, member_id)
    if not target or target.family_id != family_id:
        raise not_found("Member")

    if target.user_id == operator_id:
        raise bad_request("请使用退出家庭功能，不能移出自己")

    _ensure_not_last_admin(db, family_id, target)
    db.delete(target)
    db.commit()


def delete_family(db: Session, family_id: int, operator_id: int) -> None:
    require_admin(db, family_id, operator_id)

    family = db.get(Family, family_id)
    if not family:
        raise not_found("Family")

    party_ids = [
        pid for (pid,) in db.query(Party.id).filter(Party.family_id == family_id).all()
    ]
    if party_ids:
        db.query(PartyGuest).filter(PartyGuest.party_id.in_(party_ids)).delete(
            synchronize_session=False
        )
        db.query(Party).filter(Party.family_id == family_id).delete(synchronize_session=False)

    order_ids = [
        oid for (oid,) in db.query(Order.id).filter(Order.family_id == family_id).all()
    ]
    if order_ids:
        db.query(OrderItem).filter(OrderItem.order_id.in_(order_ids)).delete(
            synchronize_session=False
        )
        db.query(Order).filter(Order.family_id == family_id).delete(synchronize_session=False)

    db.query(FamilyMember).filter(FamilyMember.family_id == family_id).delete(
        synchronize_session=False
    )
    db.delete(family)
    db.commit()
