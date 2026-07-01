import asyncio
import json

from fastapi import WebSocket


class OrderWsHub:
    def __init__(self) -> None:
        self._rooms: dict[int, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, family_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._rooms.setdefault(family_id, set()).add(websocket)

    async def disconnect(self, family_id: int, websocket: WebSocket) -> None:
        async with self._lock:
            room = self._rooms.get(family_id)
            if not room:
                return
            room.discard(websocket)
            if not room:
                del self._rooms[family_id]

    async def broadcast(self, family_id: int, message: dict) -> None:
        payload = json.dumps(message, ensure_ascii=False)
        async with self._lock:
            connections = list(self._rooms.get(family_id, set()))

        dead: list[WebSocket] = []
        for ws in connections:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)

        for ws in dead:
            await self.disconnect(family_id, ws)


order_hub = OrderWsHub()


async def notify_orders_updated(family_id: int) -> None:
    await order_hub.broadcast(
        family_id,
        {"type": "orders_updated", "family_id": family_id},
    )
