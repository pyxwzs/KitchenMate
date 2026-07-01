from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.core.exceptions import not_found
from app.models.menu import Dish
from app.models.user import User
from app.services.family import get_family_cook, require_family_access, user_display_name
from app.utils.images import save_dish_image


def _get_user_dish(db: Session, user_id: int, dish_id: int) -> Dish:
    dish = db.get(Dish, dish_id)
    if not dish or dish.user_id != user_id:
        raise not_found("Dish")
    return dish


def build_user_menu(db: Session, user_id: int, active_only: bool) -> list[Dish]:
    query = db.query(Dish).filter(Dish.user_id == user_id)
    if active_only:
        query = query.filter(Dish.is_active.is_(True))
    return query.order_by(Dish.sort_order.asc(), Dish.id.asc()).all()


def get_my_menu(db: Session, user_id: int) -> dict:
    dishes = build_user_menu(db, user_id, active_only=False)
    return {"dishes": dishes}


def get_family_menu(db: Session, family_id: int, viewer_id: int) -> dict:
    require_family_access(db, family_id, viewer_id)
    cook = get_family_cook(db, family_id)
    dishes = build_user_menu(db, cook.id, active_only=True)
    return {
        "family_id": family_id,
        "cook": {
            "id": cook.id,
            "display_name": user_display_name(cook),
        },
        "dishes": dishes,
    }


def create_dish(
    db: Session,
    user: User,
    name: str,
    description: str | None,
    image_url: str | None,
    sort_order: int,
    is_active: bool,
) -> Dish:
    dish = Dish(
        user_id=user.id,
        name=name.strip(),
        description=description.strip() if description else None,
        image_url=image_url,
        sort_order=sort_order,
        is_active=is_active,
    )
    db.add(dish)
    db.commit()
    db.refresh(dish)
    return dish


def update_dish(db: Session, user_id: int, dish_id: int, **fields) -> Dish:
    dish = _get_user_dish(db, user_id, dish_id)
    if "name" in fields:
        dish.name = fields["name"].strip()
    if "description" in fields:
        dish.description = fields["description"].strip() if fields["description"] else None
    if "image_url" in fields:
        dish.image_url = fields["image_url"]
    if "sort_order" in fields:
        dish.sort_order = fields["sort_order"]
    if "is_active" in fields:
        dish.is_active = fields["is_active"]
    db.commit()
    db.refresh(dish)
    return dish


def delete_dish(db: Session, user_id: int, dish_id: int) -> None:
    dish = _get_user_dish(db, user_id, dish_id)
    db.delete(dish)
    db.commit()


async def upload_dish_image(db: Session, user_id: int, dish_id: int, file: UploadFile) -> Dish:
    dish = _get_user_dish(db, user_id, dish_id)
    user = db.get(User, user_id)
    if not user:
        raise not_found("User")
    dish.image_url = await save_dish_image(file, user.openid, dish.id)
    db.commit()
    db.refresh(dish)
    return dish
