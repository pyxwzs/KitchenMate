from datetime import UTC, datetime

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import bad_request, not_found
from app.models.order import (
    ACTIVE_ORDER_STATUSES,
    HISTORY_ORDER_STATUSES,
    ORDER_STATUS_LABELS,
    Order,
    OrderItem,
    OrderStatus,
)
from app.models.menu import Dish
from app.models.user import User
from app.services.family import get_family_cook, require_family_access, user_display_name
from app.services.menu import build_orderable_menu_dishes, build_user_menu


def _serialize_item(
    item: OrderItem,
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


def _serialize_session(order: Order, viewer_id: int, users: dict[int, User]) -> dict:
    locked_by = users.get(order.locked_by_user_id) if order.locked_by_user_id else None
    return {
        "id": order.id,
        "family_id": order.family_id,
        "cook_user_id": order.cook_user_id,
        "status": order.status,
        "status_label": ORDER_STATUS_LABELS[order.status],
        "note": order.note,
        "locked_by_user_id": order.locked_by_user_id,
        "locked_by_name": user_display_name(locked_by) if locked_by else None,
        "locked_at": order.locked_at,
        "items": [_serialize_item(item, users) for item in order.items],
        "created_at": order.created_at,
    }


def _load_users(db: Session, user_ids: set[int]) -> dict[int, User]:
    if not user_ids:
        return {}
    rows = db.query(User).filter(User.id.in_(user_ids)).all()
    return {u.id: u for u in rows}


def _get_session(db: Session, family_id: int, session_id: int) -> Order:
    order = (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(Order.id == session_id, Order.family_id == family_id)
        .first()
    )
    if not order:
        raise not_found("Order")
    return order


def _get_open_session(db: Session, family_id: int) -> Order | None:
    return (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(Order.family_id == family_id, Order.status == OrderStatus.OPEN)
        .order_by(Order.created_at.desc())
        .first()
    )


def _get_or_create_open_session(db: Session, family_id: int) -> Order:
    session = _get_open_session(db, family_id)
    if session:
        return session

    cook = get_family_cook(db, family_id)
    session = Order(
        family_id=family_id,
        user_id=cook.id,
        cook_user_id=cook.id,
        status=OrderStatus.OPEN,
    )
    db.add(session)
    db.flush()
    return session


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


def _merge_items(session: Order, user_id: int, validated_items: list[tuple]) -> None:
    for dish, quantity, note in validated_items:
        merged = False
        # 仅在无备注或备注相同时合并数量
        if not note:
            for item in session.items:
                if item.user_id == user_id and item.dish_id == dish.id and not item.note:
                    item.quantity += quantity
                    merged = True
                    break
        if not merged:
            session.items.append(
                OrderItem(
                    user_id=user_id,
                    dish_id=dish.id,
                    dish_name=dish.name,
                    image_url=dish.image_url,
                    quantity=quantity,
                    note=note,
                )
            )


def _decrease_my_dish(session: Order, user_id: int, dish_id: int, amount: int) -> None:
    remaining = amount
    for item in sorted(session.items, key=lambda x: x.id, reverse=True):
        if item.user_id != user_id or item.dish_id != dish_id:
            continue
        if item.quantity <= remaining:
            remaining -= item.quantity
            session.items.remove(item)
        else:
            item.quantity -= remaining
            remaining = 0
        if remaining <= 0:
            break


def adjust_session_item(
    db: Session,
    family_id: int,
    user_id: int,
    dish_id: int,
    delta: int,
    note: str | None = None,
) -> Order | None:
    require_family_access(db, family_id, user_id)
    if delta == 0:
        raise bad_request("调整数量不能为 0")

    session = _get_open_session(db, family_id)
    if delta < 0:
        if not session:
            return None
        _decrease_my_dish(session, user_id, dish_id, -delta)
        db.commit()
        db.refresh(session)
        return _get_session(db, family_id, session.id)

    if not session:
        session = _get_or_create_open_session(db, family_id)
    validated = _validate_menu_items(
        db, family_id, user_id, [{"dish_id": dish_id, "quantity": delta, "note": note}]
    )
    _merge_items(session, user_id, validated)
    db.commit()
    db.refresh(session)
    return _get_session(db, family_id, session.id)


def update_session_item(
    db: Session,
    family_id: int,
    user_id: int,
    item_id: int,
    quantity: int | None = None,
    note: str | None = None,
) -> Order | None:
    require_family_access(db, family_id, user_id)
    session = _get_open_session(db, family_id)
    if not session:
        raise not_found("订单")

    target = next((i for i in session.items if i.id == item_id), None)
    if not target:
        raise not_found("菜品")
    if target.user_id != user_id:
        raise forbidden("只能修改自己的点餐")

    if quantity is not None:
        if quantity <= 0:
            session.items.remove(target)
        else:
            target.quantity = quantity
    if note is not None:
        target.note = note.strip() if note.strip() else None

    db.commit()
    db.refresh(session)
    return _get_session(db, family_id, session.id)


def add_to_session(
    db: Session,
    family_id: int,
    user_id: int,
    items: list[dict],
    note: str | None,
) -> Order:
    require_family_access(db, family_id, user_id)
    validated = _validate_menu_items(db, family_id, user_id, items)
    session = _get_or_create_open_session(db, family_id)
    _merge_items(session, user_id, validated)

    if note and note.strip():
        session.note = note.strip()

    db.commit()
    db.refresh(session)
    return _get_session(db, family_id, session.id)


def lock_session(db: Session, family_id: int, user_id: int) -> Order:
    require_family_access(db, family_id, user_id)
    session = _get_open_session(db, family_id)
    if not session:
        raise bad_request("No open order session to lock")
    if not session.items:
        raise bad_request("Cannot lock an empty order session")

    session.status = OrderStatus.LOCKED
    session.locked_by_user_id = user_id
    session.locked_at = datetime.now(UTC)
    db.commit()
    db.refresh(session)
    return _get_session(db, family_id, session.id)


def _load_dish_owners(db: Session, dish_ids: set[int]) -> dict[int, int]:
    if not dish_ids:
        return {}
    rows = db.query(Dish).filter(Dish.id.in_(dish_ids)).all()
    return {d.id: d.user_id for d in rows}


def _build_summary_from_session(
    session: Order | None,
    viewer_id: int,
    users: dict[int, User],
    dish_owners: dict[int, int] | None = None,
) -> dict:
    if not session:
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
        "session": _serialize_session(session, viewer_id, users),
    }


def get_open_session_summary(db: Session, family_id: int, viewer_id: int) -> dict:
    require_family_access(db, family_id, viewer_id)
    session = _get_open_session(db, family_id)
    user_ids: set[int] = set()
    dish_owners: dict[int, int] = {}
    if session:
        user_ids.add(session.locked_by_user_id or 0)
        user_ids.update(item.user_id for item in session.items)
        dish_ids = {item.dish_id for item in session.items if item.dish_id}
        dish_owners = _load_dish_owners(db, dish_ids)
        user_ids.update(dish_owners.values())
    user_ids.discard(0)
    users = _load_users(db, user_ids)
    summary = _build_summary_from_session(session, viewer_id, users, dish_owners)
    summary["family_id"] = family_id
    return summary


def list_history_sessions(
    db: Session,
    family_id: int,
    viewer_id: int,
    limit: int = 50,
) -> list[dict]:
    require_family_access(db, family_id, viewer_id)

    sessions = (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(
            Order.family_id == family_id,
            Order.status.in_(HISTORY_ORDER_STATUSES),
        )
        .order_by(Order.locked_at.desc(), Order.created_at.desc())
        .limit(limit)
        .all()
    )

    user_ids: set[int] = set()
    for session in sessions:
        if session.locked_by_user_id:
            user_ids.add(session.locked_by_user_id)
        user_ids.update(item.user_id for item in session.items)
    users = _load_users(db, user_ids)
    return [_serialize_session(s, viewer_id, users) for s in sessions]
