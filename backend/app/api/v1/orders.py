from fastapi import APIRouter, Query

from app.dependencies import CurrentUser, DbSession
from app.schemas.order import (
    AddToSessionRequest,
    OrderSessionResponse,
    OrderSummaryResponse,
)
from app.services import order as order_service
from app.ws.order_hub import notify_orders_updated

router = APIRouter(prefix="/families/{family_id}/orders", tags=["orders"])


def _serialize_for_response(db, session, viewer_id: int) -> dict:
    user_ids = {item.user_id for item in session.items}
    if session.locked_by_user_id:
        user_ids.add(session.locked_by_user_id)
    users = order_service._load_users(db, user_ids)
    return order_service._serialize_session(session, viewer_id, users)


@router.post("", response_model=OrderSessionResponse)
async def add_to_session(
    family_id: int,
    body: AddToSessionRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> dict:
    items = [{"dish_id": i.dish_id, "quantity": i.quantity} for i in body.items]
    session = order_service.add_to_session(db, family_id, current_user.id, items, body.note)
    await notify_orders_updated(family_id)
    return _serialize_for_response(db, session, current_user.id)


@router.post("/lock", response_model=OrderSessionResponse)
async def lock_session(
    family_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> dict:
    session = order_service.lock_session(db, family_id, current_user.id)
    await notify_orders_updated(family_id)
    return _serialize_for_response(db, session, current_user.id)


@router.get("/summary", response_model=OrderSummaryResponse)
def get_order_summary(
    family_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> dict:
    return order_service.get_open_session_summary(db, family_id, current_user.id)


@router.get("/history", response_model=list[OrderSessionResponse])
def list_history_sessions(
    family_id: int,
    current_user: CurrentUser,
    db: DbSession,
    limit: int = Query(50, ge=1, le=100),
) -> list[dict]:
    return order_service.list_history_sessions(db, family_id, current_user.id, limit)
