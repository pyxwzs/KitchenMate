import threading
from dataclasses import dataclass, field
from datetime import UTC, datetime


@dataclass
class TableItem:
    id: int
    user_id: int
    dish_id: int | None
    dish_name: str
    image_url: str | None
    quantity: int
    note: str | None


@dataclass
class TableSession:
    family_id: int
    cook_user_id: int
    note: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    items: list[TableItem] = field(default_factory=list)

    @property
    def id(self) -> int:
        return self.family_id


class TableStore:
    """本桌点餐内存存储，按 family_id 隔离，服务重启后清空。"""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._sessions: dict[int, TableSession] = {}
        self._item_seq: dict[int, int] = {}

    def get(self, family_id: int) -> TableSession | None:
        with self._lock:
            return self._sessions.get(family_id)

    def get_or_create(self, family_id: int, cook_user_id: int) -> TableSession:
        with self._lock:
            session = self._sessions.get(family_id)
            if session is None:
                session = TableSession(family_id=family_id, cook_user_id=cook_user_id)
                self._sessions[family_id] = session
            return session

    def clear(self, family_id: int) -> TableSession | None:
        with self._lock:
            session = self._sessions.pop(family_id, None)
            self._item_seq.pop(family_id, None)
            return session

    def _next_item_id(self, family_id: int) -> int:
        value = self._item_seq.get(family_id, 0) + 1
        self._item_seq[family_id] = value
        return value

    def merge_items(
        self,
        family_id: int,
        cook_user_id: int,
        user_id: int,
        validated_items: list[tuple],
    ) -> TableSession:
        with self._lock:
            session = self._sessions.get(family_id)
            if session is None:
                session = TableSession(family_id=family_id, cook_user_id=cook_user_id)
                self._sessions[family_id] = session

            for dish, quantity, note in validated_items:
                merged = False
                if not note:
                    for item in session.items:
                        if (
                            item.user_id == user_id
                            and item.dish_id == dish.id
                            and not item.note
                        ):
                            item.quantity += quantity
                            merged = True
                            break
                if not merged:
                    session.items.append(
                        TableItem(
                            id=self._next_item_id(family_id),
                            user_id=user_id,
                            dish_id=dish.id,
                            dish_name=dish.name,
                            image_url=dish.image_url,
                            quantity=quantity,
                            note=note,
                        )
                    )
            return session

    def decrease_my_dish(
        self, family_id: int, user_id: int, dish_id: int, amount: int
    ) -> TableSession | None:
        with self._lock:
            session = self._sessions.get(family_id)
            if not session:
                return None

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
            return session

    def update_item(
        self,
        family_id: int,
        user_id: int,
        item_id: int,
        quantity: int | None,
        note: str | None,
    ) -> TableSession | None:
        with self._lock:
            session = self._sessions.get(family_id)
            if not session:
                return None

            target = next((i for i in session.items if i.id == item_id), None)
            if not target:
                return None
            if target.user_id != user_id:
                raise PermissionError("只能修改自己的点餐")

            if quantity is not None:
                if quantity <= 0:
                    session.items.remove(target)
                else:
                    target.quantity = quantity
            if note is not None:
                target.note = note.strip() if note.strip() else None
            return session

    def set_note(self, family_id: int, note: str | None) -> TableSession | None:
        with self._lock:
            session = self._sessions.get(family_id)
            if session is None:
                return None
            session.note = note
            return session


table_store = TableStore()
