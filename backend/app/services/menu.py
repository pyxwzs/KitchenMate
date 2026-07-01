from datetime import UTC, datetime

from fastapi import UploadFile
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import not_found
from app.models.family import FamilyMember
from app.models.menu import Dish
from app.models.party import Party, PartyGuest, PartyStatus
from app.models.user import User
from app.services.family import require_family_access, serialize_menu_members
from app.utils.images import save_dish_image


def _get_user_dish(db: Session, user_id: int, dish_id: int) -> Dish:
    dish = db.get(Dish, dish_id)
    if not dish or dish.user_id != user_id:
        raise not_found("Dish")
    return dish


def build_user_menu(db: Session, user_id: int, active_only: bool) -> list[Dish]:
    query = db.query(Dish).filter(Dish.user_id == user_id)
    if active_only:
        query = query.filter(Dish.is_active.is_(True))
    return query.order_by(Dish.sort_order.asc(), Dish.id.asc()).all()


def _users_with_active_dishes(db: Session, user_ids: list[int]) -> list[User]:
    """按给定顺序返回有上架菜品的用户。"""
    result: list[User] = []
    seen: set[int] = set()
    for user_id in user_ids:
        if user_id in seen:
            continue
        seen.add(user_id)
        user = db.get(User, user_id)
        if not user:
            continue
        if build_user_menu(db, user.id, active_only=True):
            result.append(user)
    return result


def get_viewer_active_party(db: Session, family_id: int, viewer_id: int) -> Party | None:
    """当前用户已加入（发起或来宾）的进行中聚会。"""
    party = (
        db.query(Party)
        .options(joinedload(Party.guests))
        .filter(Party.family_id == family_id, Party.status == PartyStatus.ACTIVE)
        .order_by(Party.created_at.desc())
        .first()
    )
    if not party:
        return None
    if party.host_user_id == viewer_id:
        return party
    if any(g.user_id == viewer_id for g in party.guests):
        return party
    return None


def get_party_participant_ids(party: Party) -> list[int]:
    """聚会参与者：创建者 + 所有已加入来宾（按加入顺序）。"""
    ids = [party.host_user_id]
    guests = sorted(party.guests, key=lambda g: (g.created_at is None, g.created_at or datetime.min.replace(tzinfo=UTC), g.id))
    for guest in guests:
        if guest.user_id not in ids:
            ids.append(guest.user_id)
    return ids


def build_party_menu_dishes(db: Session, party: Party) -> tuple[list[Dish], list[User]]:
    members = _users_with_active_dishes(db, get_party_participant_ids(party))
    dishes: list[Dish] = []
    for user in members:
        dishes.extend(build_user_menu(db, user.id, active_only=True))
    return dishes, members


def get_my_menu(db: Session, user_id: int) -> dict:
    dishes = build_user_menu(db, user_id, active_only=False)
    return {"dishes": dishes}


def get_family_menu_members(db: Session, family_id: int) -> list[User]:
    """家庭中有上架菜品的成员（按加入顺序），无菜成员不返回。"""
    members = (
        db.query(FamilyMember)
        .filter(FamilyMember.family_id == family_id)
        .order_by(FamilyMember.id.asc())
        .all()
    )
    result: list[User] = []
    for member in members:
        user = db.get(User, member.user_id)
        if not user:
            continue
        if build_user_menu(db, user.id, active_only=True):
            result.append(user)
    return result


def build_family_menu_dishes(db: Session, family_id: int) -> tuple[list[Dish], list[User]]:
    members = get_family_menu_members(db, family_id)
    dishes: list[Dish] = []
    for user in members:
        dishes.extend(build_user_menu(db, user.id, active_only=True))
    return dishes, members


def build_orderable_menu_dishes(
    db: Session, family_id: int, viewer_id: int
) -> tuple[list[Dish], list[User], Party | None]:
    party = get_viewer_active_party(db, family_id, viewer_id)
    if party:
        dishes, members = build_party_menu_dishes(db, party)
        return dishes, members, party
    dishes, members = build_family_menu_dishes(db, family_id)
    return dishes, members, None


def get_family_menu(db: Session, family_id: int, viewer_id: int) -> dict:
    require_family_access(db, family_id, viewer_id)
    dishes, members, party = build_orderable_menu_dishes(db, family_id, viewer_id)
    member_infos = serialize_menu_members(members)
    primary = member_infos[0] if member_infos else None
    return {
        "family_id": family_id,
        "cook": primary,
        "cooks": member_infos,
        "menu_members": member_infos,
        "dishes": dishes,
        "is_party_menu": party is not None,
        "party_id": party.id if party else None,
    }


def create_dish(
    db: Session,
    user: User,
    name: str,
    description: str | None,
    image_url: str | None,
    sort_order: int,
    is_active: bool,
) -> Dish:
    dish = Dish(
        user_id=user.id,
        name=name.strip(),
        description=description.strip() if description else None,
        image_url=image_url,
        sort_order=sort_order,
        is_active=is_active,
    )
    db.add(dish)
    db.commit()
    db.refresh(dish)
    return dish


def update_dish(db: Session, user_id: int, dish_id: int, **fields) -> Dish:
    dish = _get_user_dish(db, user_id, dish_id)
    if "name" in fields:
        dish.name = fields["name"].strip()
    if "description" in fields:
        dish.description = fields["description"].strip() if fields["description"] else None
    if "image_url" in fields:
        dish.image_url = fields["image_url"]
    if "sort_order" in fields:
        dish.sort_order = fields["sort_order"]
    if "is_active" in fields:
        dish.is_active = fields["is_active"]
    db.commit()
    db.refresh(dish)
    return dish


def delete_dish(db: Session, user_id: int, dish_id: int) -> None:
    dish = _get_user_dish(db, user_id, dish_id)
    db.delete(dish)
    db.commit()


async def upload_dish_image(db: Session, user_id: int, dish_id: int, file: UploadFile) -> Dish:
    dish = _get_user_dish(db, user_id, dish_id)
    user = db.get(User, user_id)
    if not user:
        raise not_found("User")
    dish.image_url = await save_dish_image(file, user.openid, dish.id)
    db.commit()
    db.refresh(dish)
    return dish
