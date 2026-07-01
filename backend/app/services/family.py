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
    """订单会话兼容字段：取第一位有菜品的成员，否则取第一位家庭成员。"""
    from app.services.menu import get_family_menu_members

    members = get_family_menu_members(db, family_id)
    if members:
        return members[0]

    member = (
        db.query(FamilyMember)
        .filter(FamilyMember.family_id == family_id)
        .order_by(FamilyMember.id.asc())
        .first()
    )
    if not member:
        raise not_found("家庭")

    user = db.get(User, member.user_id)
    if not user:
        raise not_found("用户")
    return user


def serialize_menu_members(users: list[User]) -> list[dict]:
    return [{"id": u.id, "display_name": user_display_name(u)} for u in users]


# 兼容旧调用
def get_family_cooks(db: Session, family_id: int) -> list[User]:
    from app.services.menu import get_family_menu_members

    return get_family_menu_members(db, family_id)


def serialize_cooks(cooks: list[User]) -> list[dict]:
    return serialize_menu_members(cooks)


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
        raise forbidden("您没有权限访问该家庭")


def require_member(db: Session, family_id: int, user_id: int) -> FamilyMember:
    member = get_member(db, family_id, user_id)
    if not member:
        raise forbidden("您不是该家庭成员")
    return member


def require_admin(db: Session, family_id: int, user_id: int) -> FamilyMember:
    member = require_member(db, family_id, user_id)
    if member.role != FamilyRole.ADMIN:
        raise forbidden("需要管理员权限")
    return member


def is_family_owner(family: Family, user_id: int) -> bool:
    return family.created_by == user_id


def require_owner(db: Session, family_id: int, user_id: int) -> Family:
    family = db.get(Family, family_id)
    if not family:
        raise not_found("家庭")
    if not is_family_owner(family, user_id):
        raise forbidden("仅超级管理员可执行此操作")
    if not get_member(db, family_id, user_id):
        raise forbidden("您已退出该家庭，无法执行此操作")
    return family


def _ensure_can_manage_member(
    db: Session,
    family_id: int,
    operator_id: int,
    target: FamilyMember,
) -> Family:
    family = db.get(Family, family_id)
    if not family:
        raise not_found("家庭")

    if is_family_owner(family, target.user_id):
        raise forbidden("不能操作超级管理员")

    if target.role == FamilyRole.ADMIN and not is_family_owner(family, operator_id):
        raise forbidden("仅超级管理员可管理其他管理员")

    return family


def role_to_public(role: FamilyRole) -> str:
    if role == FamilyRole.ADMIN:
        return "admin"
    return "member"


def role_from_public(value: str) -> FamilyRole:
    key = (value or "").strip().lower()
    if key == "admin":
        return FamilyRole.ADMIN
    if key in ("member", "diner", "chef"):
        return FamilyRole.DINER
    raise bad_request("角色只能是管理员或成员")


def build_family_response(family: Family, user_id: int | None, member_count: int) -> dict:
    my_role = None
    my_is_owner = False
    if user_id is not None:
        my_is_owner = is_family_owner(family, user_id)
        for member in family.members:
            if member.user_id == user_id:
                my_role = role_to_public(member.role)
                break
    return {
        "id": family.id,
        "name": family.name,
        "invite_code": family.invite_code,
        "created_by": family.created_by,
        "my_role": my_role,
        "my_is_owner": my_is_owner,
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
        raise not_found("家庭")

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
                "role": role_to_public(member.role),
                "is_owner": is_family_owner(family, member.user_id),
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
    menu_members = get_family_cooks(db, family_id)
    data["cook"] = {
        "id": cook.id,
        "display_name": user_display_name(cook),
    }
    data["cooks"] = serialize_cooks(menu_members)
    data["menu_members"] = serialize_menu_members(menu_members)
    return data


def get_invite_info(db: Session, family_id: int, user_id: int) -> dict:
    member = require_member(db, family_id, user_id)
    family = db.get(Family, family_id)
    if not family:
        raise not_found("家庭")

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
        raise not_found("邀请码")

    existing = get_member(db, family.id, user.id)
    if existing:
        raise bad_request("您已是该家庭成员")

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
    role: str,
) -> FamilyMember:
    require_admin(db, family_id, operator_id)

    target = db.get(FamilyMember, member_id)
    if not target or target.family_id != family_id:
        raise not_found("成员")

    family = _ensure_can_manage_member(db, family_id, operator_id, target)

    parsed = role_from_public(role)

    if is_family_owner(family, target.user_id) and parsed != FamilyRole.ADMIN:
        raise forbidden("不能变更超级管理员的角色")

    if target.role == FamilyRole.ADMIN and parsed != FamilyRole.ADMIN:
        _ensure_not_last_admin(db, family_id, target)

    target.role = parsed
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
    from app.models.party import Party, PartyStatus

    member = require_member(db, family_id, user_id)
    if (
        db.query(Party.id)
        .filter(
            Party.family_id == family_id,
            Party.host_user_id == user_id,
            Party.status == PartyStatus.ACTIVE,
        )
        .first()
    ):
        raise bad_request("您正在发起聚会，请先结束聚会再退出家庭")
    _ensure_not_last_admin(db, family_id, member)
    db.delete(member)
    db.commit()


def remove_member(db: Session, family_id: int, operator_id: int, member_id: int) -> None:
    require_admin(db, family_id, operator_id)

    target = db.get(FamilyMember, member_id)
    if not target or target.family_id != family_id:
        raise not_found("成员")

    if target.user_id == operator_id:
        raise bad_request("请使用退出家庭功能，不能移出自己")

    _ensure_can_manage_member(db, family_id, operator_id, target)
    _ensure_not_last_admin(db, family_id, target)
    db.delete(target)
    db.commit()


def delete_family(db: Session, family_id: int, operator_id: int) -> None:
    require_owner(db, family_id, operator_id)

    family = db.get(Family, family_id)
    if not family:
        raise not_found("家庭")

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
