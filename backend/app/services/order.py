from sqlalchemy.orm import Session

from app.core.exceptions import bad_request, forbidden, not_found
from app.models.family import Family, FamilyRole
from app.models.menu import Dish
from app.models.order import ORDER_STATUS_LABELS, OrderStatus
from app.models.user import User
from app.services.family import (
    get_family_cook,
    get_member,
    is_family_owner,
    require_family_access,
    user_display_name,
)
from app.services.menu import build_orderable_menu_dishes
from app.services.table_store import TableItem, TableSession, table_store


def _serialize_item(
    item: TableItem,
    users: dict[int, User],
    dish_owners: dict[int, int] | None = None,
) -> dict:
    user = users.get(item.user_id)
    cook_id = None
    cook_name = None
    if dish_owners and item.dish_id:
        cook_id = dish_owners.get(item.dish_id)
        if cook_id:
            cook = users.get(cook_id)
            cook_name = user_display_name(cook) if cook else None
    data = {
        "id": item.id,
        "user_id": item.user_id,
        "user_name": user_display_name(user) if user else f"用户{item.user_id}",
        "dish_id": item.dish_id,
        "dish_name": item.dish_name,
        "image_url": item.image_url,
        "quantity": item.quantity,
        "note": item.note,
    }
    if cook_id is not None:
        data["cook_user_id"] = cook_id
        data["cook_name"] = cook_name
    return data


def _serialize_session(
    session: TableSession,
    users: dict[int, User],
    dish_owners: dict[int, int] | None = None,
) -> dict:
    return {
        "id": session.id,
        "family_id": session.family_id,
        "cook_user_id": session.cook_user_id,
        "status": OrderStatus.OPEN,
        "status_label": ORDER_STATUS_LABELS[OrderStatus.OPEN],
        "note": session.note,
        "items": [_serialize_item(item, users, dish_owners) for item in session.items],
        "created_at": session.created_at,
    }


def _load_users(db: Session, user_ids: set[int]) -> dict[int, User]:
    if not user_ids:
        return {}
    rows = db.query(User).filter(User.id.in_(user_ids)).all()
    return {u.id: u for u in rows}


def get_open_session(family_id: int) -> TableSession | None:
    return table_store.get(family_id)


def _get_family_menu_map(db: Session, family_id: int, viewer_id: int) -> dict[int, object]:
    dishes, _, _ = build_orderable_menu_dishes(db, family_id, viewer_id)
    if not dishes:
        raise bad_request("暂无可点菜品")
    return {d.id: d for d in dishes}


def _validate_menu_items(
    db: Session, family_id: int, viewer_id: int, items: list[dict]
) -> list[tuple]:
    menu_dishes = _get_family_menu_map(db, family_id, viewer_id)

    validated: list[tuple] = []
    for entry in items:
        dish_id = entry["dish_id"]
        quantity = entry["quantity"]
        note = entry.get("note") or None
        dish = menu_dishes.get(dish_id)
        if not dish:
            raise bad_request(f"菜品 {dish_id} 不可点")
        validated.append((dish, quantity, note))
    return validated


def _session_for_response(
    db: Session, session: TableSession | None, viewer_id: int
) -> dict | None:
    if not session:
        return None
    user_ids = {item.user_id for item in session.items}
    dish_ids = {item.dish_id for item in session.items if item.dish_id}
    dish_owners = _load_dish_owners(db, dish_ids)
    user_ids.update(dish_owners.values())
    users = _load_users(db, user_ids)
    return _serialize_session(session, users, dish_owners)


def adjust_session_item(
    db: Session,
    family_id: int,
    user_id: int,
    dish_id: int,
    delta: int,
    note: str | None = None,
) -> TableSession | None:
    require_family_access(db, family_id, user_id)
    if delta == 0:
        raise bad_request("调整数量不能为 0")

    if delta < 0:
        return table_store.decrease_my_dish(family_id, user_id, dish_id, -delta)

    validated = _validate_menu_items(
        db, family_id, user_id, [{"dish_id": dish_id, "quantity": delta, "note": note}]
    )
    cook = get_family_cook(db, family_id)
    return table_store.merge_items(family_id, cook.id, user_id, validated)


def update_session_item(
    db: Session,
    family_id: int,
    user_id: int,
    item_id: int,
    quantity: int | None = None,
    note: str | None = None,
) -> TableSession | None:
    require_family_access(db, family_id, user_id)
    if not table_store.get(family_id):
        raise not_found("订单")

    try:
        session = table_store.update_item(
            family_id, user_id, item_id, quantity, note
        )
    except PermissionError:
        raise forbidden("只能修改自己的点餐")

    if session is None:
        raise not_found("菜品")
    return session


def add_to_session(
    db: Session,
    family_id: int,
    user_id: int,
    items: list[dict],
    note: str | None,
) -> TableSession:
    require_family_access(db, family_id, user_id)
    validated = _validate_menu_items(db, family_id, user_id, items)
    cook = get_family_cook(db, family_id)
    session = table_store.merge_items(family_id, cook.id, user_id, validated)

    if note and note.strip():
        table_store.set_note(family_id, note.strip())
        session = table_store.get(family_id) or session
    return session


def can_complete_meal(db: Session, family_id: int, user_id: int) -> bool:
    from app.services.party import is_active_party_host

    if is_active_party_host(db, family_id, user_id):
        return True
    member = get_member(db, family_id, user_id)
    if member and member.role == FamilyRole.ADMIN:
        return True
    family = db.get(Family, family_id)
    return bool(family and is_family_owner(family, user_id))


def clear_session(
    db: Session,
    family_id: int,
    user_id: int,
    *,
    require_permission: bool = True,
    require_items: bool = True,
) -> None:
    require_family_access(db, family_id, user_id)
    if require_permission and not can_complete_meal(db, family_id, user_id):
        raise forbidden("只有家庭管理员或聚会发起者可以确认出餐")

    session = table_store.get(family_id)
    if not session:
        if require_items:
            raise bad_request("当前没有进行中的点餐")
        return
    if require_items and not session.items:
        raise bad_request("还没有点菜，无法确认出餐")

    table_store.clear(family_id)


def _load_dish_owners(db: Session, dish_ids: set[int]) -> dict[int, int]:
    if not dish_ids:
        return {}
    rows = db.query(Dish).filter(Dish.id.in_(dish_ids)).all()
    return {d.id: d.user_id for d in rows}


def _build_summary_from_session(
    session: TableSession | None,
    users: dict[int, User],
    dish_owners: dict[int, int] | None = None,
) -> dict:
    if not session or not session.items:
        return {
            "session_id": None,
            "family_id": None,
            "total_dishes": 0,
            "dish_totals": [],
            "by_user": [],
            "by_cook": [],
            "session": None,
        }

    items_data = [
        _serialize_item(item, users, dish_owners) for item in session.items
    ]
    dish_totals: dict[str, dict] = {}
    by_user: dict[int, dict] = {}
    by_cook: dict[int, dict] = {}
    total_dishes = 0

    for item in items_data:
        total_dishes += item["quantity"]
        key = item["dish_name"]
        if key not in dish_totals:
            dish_totals[key] = {
                "dish_id": item["dish_id"],
                "dish_name": item["dish_name"],
                "cook_name": item.get("cook_name"),
                "cook_user_id": item.get("cook_user_id"),
                "image_url": item["image_url"],
                "quantity": 0,
            }
        dish_totals[key]["quantity"] += item["quantity"]

        user_entry = by_user.setdefault(
            item["user_id"],
            {
                "user_id": item["user_id"],
                "user_name": item["user_name"],
                "items": [],
            },
        )
        user_entry["items"].append(item)

        cook_id = item.get("cook_user_id")
        if cook_id:
            cook_entry = by_cook.setdefault(
                cook_id,
                {
                    "cook_user_id": cook_id,
                    "cook_name": item.get("cook_name") or f"用户{cook_id}",
                    "items": [],
                },
            )
            cook_entry["items"].append(item)

    return {
        "session_id": session.id,
        "family_id": session.family_id,
        "total_dishes": total_dishes,
        "dish_totals": list(dish_totals.values()),
        "by_user": list(by_user.values()),
        "by_cook": list(by_cook.values()),
        "session": _serialize_session(session, users, dish_owners),
    }


def get_open_session_summary(db: Session, family_id: int, viewer_id: int) -> dict:
    require_family_access(db, family_id, viewer_id)
    session = table_store.get(family_id)
    user_ids: set[int] = set()
    dish_owners: dict[int, int] = {}
    if session:
        user_ids.update(item.user_id for item in session.items)
        dish_ids = {item.dish_id for item in session.items if item.dish_id}
        dish_owners = _load_dish_owners(db, dish_ids)
        user_ids.update(dish_owners.values())
    users = _load_users(db, user_ids)
    summary = _build_summary_from_session(session, users, dish_owners)
    summary["family_id"] = family_id
    summary["can_complete_meal"] = can_complete_meal(db, family_id, viewer_id)
    return summary
