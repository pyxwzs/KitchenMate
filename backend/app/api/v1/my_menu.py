from fastapi import APIRouter, File, UploadFile

from app.dependencies import CurrentUser, DbSession
from app.schemas.menu import DishCreateRequest, DishResponse, DishUpdateRequest, MyMenuResponse
from app.services import menu as menu_service

router = APIRouter(prefix="/menu/my", tags=["menu"])


@router.get("", response_model=MyMenuResponse)
def get_my_menu(current_user: CurrentUser, db: DbSession) -> dict:
    return menu_service.get_my_menu(db, current_user.id)


@router.post("/dishes", response_model=DishResponse)
async def create_dish(body: DishCreateRequest, current_user: CurrentUser, db: DbSession):
    dish = menu_service.create_dish(
        db,
        current_user,
        body.name,
        body.description,
        body.image_url,
        body.sort_order,
        body.is_active,
    )
    await menu_service.broadcast_menu_changed(
        db,
        current_user.id,
        dish_id=dish.id,
        updated_at=dish.updated_at,
    )
    return dish


@router.patch("/dishes/{dish_id}", response_model=DishResponse)
async def update_dish(
    dish_id: int,
    body: DishUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    data = body.model_dump(exclude_unset=True)
    dish = menu_service.update_dish(db, current_user.id, dish_id, **data)
    await menu_service.broadcast_menu_changed(
        db,
        current_user.id,
        dish_id=dish.id,
        updated_at=dish.updated_at,
    )
    return dish


@router.delete("/dishes/{dish_id}")
async def delete_dish(dish_id: int, current_user: CurrentUser, db: DbSession):
    menu_service.delete_dish(db, current_user.id, dish_id)
    await menu_service.broadcast_menu_changed(db, current_user.id, dish_id=dish_id)
    return {"message": "deleted"}


@router.post("/dishes/{dish_id}/image", response_model=DishResponse)
async def upload_dish_image(
    dish_id: int,
    current_user: CurrentUser,
    db: DbSession,
    file: UploadFile = File(...),
):
    dish = await menu_service.upload_dish_image(db, current_user.id, dish_id, file)
    await menu_service.broadcast_menu_changed(
        db,
        current_user.id,
        dish_id=dish.id,
        updated_at=dish.updated_at,
    )
    return dish
