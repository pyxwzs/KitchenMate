from fastapi import APIRouter

from app.api.v1 import auth, families, health, media, menu, my_menu, orders, parties, ws

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(ws.router)
api_router.include_router(media.router)
api_router.include_router(auth.router)
api_router.include_router(families.router)
api_router.include_router(parties.router)
api_router.include_router(orders.router)
api_router.include_router(menu.router)
api_router.include_router(my_menu.router)
