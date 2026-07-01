from pydantic import BaseModel, Field

from app.schemas.common import ORMBase


class DishCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    description: str | None = Field(None, max_length=500)
    image_url: str | None = Field(None, max_length=512)
    sort_order: int = 0
    is_active: bool = True


class DishUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=64)
    description: str | None = Field(None, max_length=500)
    image_url: str | None = Field(None, max_length=512)
    sort_order: int | None = None
    is_active: bool | None = None


class DishResponse(ORMBase):
    id: int
    user_id: int
    name: str
    description: str | None = None
    image_url: str | None = None
    sort_order: int
    is_active: bool


class CookInfo(BaseModel):
    id: int
    display_name: str


class MyMenuResponse(BaseModel):
    dishes: list[DishResponse] = []


class FamilyMenuResponse(BaseModel):
    family_id: int
    cook: CookInfo
    dishes: list[DishResponse] = []
