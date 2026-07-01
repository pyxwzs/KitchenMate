from datetime import datetime

from pydantic import BaseModel, Field

from app.models.order import OrderStatus


class OrderItemInput(BaseModel):
    dish_id: int
    quantity: int = Field(..., ge=1, le=99)
    note: str | None = Field(None, max_length=100)


class AdjustOrderItemRequest(BaseModel):
    dish_id: int
    delta: int = Field(..., ge=-99, le=99)
    note: str | None = Field(None, max_length=100)


class UpdateOrderItemRequest(BaseModel):
    quantity: int | None = Field(None, ge=0, le=99)
    note: str | None = Field(None, max_length=100)


class AddToSessionRequest(BaseModel):
    items: list[OrderItemInput] = Field(..., min_length=1)
    note: str | None = Field(None, max_length=200)


class OrderItemResponse(BaseModel):
    id: int
    user_id: int
    user_name: str
    dish_id: int | None
    dish_name: str
    image_url: str | None = None
    quantity: int
    note: str | None = None
    cook_user_id: int | None = None
    cook_name: str | None = None


class OrderSessionResponse(BaseModel):
    id: int
    family_id: int
    cook_user_id: int
    status: OrderStatus
    status_label: str
    note: str | None = None
    locked_by_user_id: int | None = None
    locked_by_name: str | None = None
    locked_at: datetime | None = None
    items: list[OrderItemResponse]
    created_at: datetime


class DishSummaryItem(BaseModel):
    dish_id: int | None
    dish_name: str
    image_url: str | None = None
    quantity: int


class UserOrderSummary(BaseModel):
    user_id: int
    user_name: str
    items: list[OrderItemResponse]


class CookOrderSummary(BaseModel):
    cook_user_id: int
    cook_name: str
    items: list[OrderItemResponse]


class OrderSummaryResponse(BaseModel):
    family_id: int
    session_id: int | None = None
    total_dishes: int
    dish_totals: list[DishSummaryItem]
    by_user: list[UserOrderSummary]
    by_cook: list[CookOrderSummary] = []
    session: OrderSessionResponse | None = None
