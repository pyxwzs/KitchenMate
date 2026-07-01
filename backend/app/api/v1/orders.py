from fastapi import APIRouter

from app.dependencies import CurrentUser, DbSession
from app.schemas.order import (
    AddToSessionRequest,
    AdjustOrderItemRequest,
    OrderSessionResponse,
    OrderSummaryResponse,
    UpdateOrderItemRequest,
)
from app.services import order as order_service
from app.ws.order_hub import notify_orders_updated

router = APIRouter(prefix="/families/{family_id}/orders", tags=["orders"])


def _empty_session(family_id: int, user_id: int) -> dict:
    return {
        "id": 0,
        "family_id": family_id,
        "cook_user_id": user_id,
        "status": "open",
        "status_label": "点餐中",
        "note": None,
        "items": [],
        "created_at": None,
    }


def _serialize_for_response(db, session, viewer_id: int) -> dict:
    data = order_service._session_for_response(db, session, viewer_id)
    if not data:
        return _empty_session(session.family_id if session else 0, viewer_id)
    return data


@router.post("", response_model=OrderSessionResponse)
async def add_to_session(
    family_id: int,
    body: AddToSessionRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> dict:
    items = [
        {"dish_id": i.dish_id, "quantity": i.quantity, "note": i.note}
        for i in body.items
    ]
    session = order_service.add_to_session(db, family_id, current_user.id, items, body.note)
    await notify_orders_updated(family_id)
    return _serialize_for_response(db, session, current_user.id)


@router.post("/adjust")
async def adjust_order_item(
    family_id: int,
    body: AdjustOrderItemRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> dict:
    session = order_service.adjust_session_item(
        db,
        family_id,
        current_user.id,
        body.dish_id,
        body.delta,
        body.note,
    )
    await notify_orders_updated(family_id)
    if not session:
        return _empty_session(family_id, current_user.id)
    return _serialize_for_response(db, session, current_user.id)


@router.patch("/items/{item_id}", response_model=OrderSessionResponse)
async def update_order_item(
    family_id: int,
    item_id: int,
    body: UpdateOrderItemRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> dict:
    session = order_service.update_session_item(
        db,
        family_id,
        current_user.id,
        item_id,
        body.quantity,
        body.note,
    )
    await notify_orders_updated(family_id)
    return _serialize_for_response(db, session, current_user.id)


@router.post("/clear", response_model=OrderSessionResponse)
async def clear_session(
    family_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> dict:
    order_service.clear_session(db, family_id, current_user.id)
    await notify_orders_updated(family_id)
    return _empty_session(family_id, current_user.id)


@router.get("/summary", response_model=OrderSummaryResponse)
def get_order_summary(
    family_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> dict:
    return order_service.get_open_session_summary(db, family_id, current_user.id)
