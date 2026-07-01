from fastapi import APIRouter

from app.dependencies import CurrentUser, DbSession
from app.schemas.menu import (
    DishCreateRequest,
    DishResponse,
    DishUpdateRequest,
    FamilyMenuResponse,
    MyMenuResponse,
)
from app.services import menu as menu_service

router = APIRouter(prefix="/families/{family_id}", tags=["menu"])


@router.get("/menu", response_model=FamilyMenuResponse)
def get_family_menu(family_id: int, current_user: CurrentUser, db: DbSession) -> dict:
    return menu_service.get_family_menu(db, family_id, current_user.id)
