from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.security import decode_access_token
from app.database import SessionLocal
from app.models.user import User
from app.services.family import require_family_access
from app.ws.order_hub import order_hub

router = APIRouter(tags=["ws"])


@router.websocket("/ws/families/{family_id}/orders")
async def orders_ws(
    websocket: WebSocket,
    family_id: int,
    token: str = Query(...),
) -> None:
    db = SessionLocal()
    try:
        payload = decode_access_token(token)
        user_id = int(payload["sub"])
        user = db.get(User, user_id)
        if not user:
            await websocket.close(code=4001, reason="Unauthorized")
            return
        require_family_access(db, family_id, user_id)
    except Exception:
        await websocket.close(code=4001, reason="Unauthorized")
        return
    finally:
        db.close()

    await order_hub.connect(family_id, websocket)
    try:
        await websocket.send_json({"type": "connected", "family_id": family_id})
        while True:
            data = await websocket.receive_text()
            if data.strip().lower() == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        await order_hub.disconnect(family_id, websocket)
