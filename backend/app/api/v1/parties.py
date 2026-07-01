from fastapi import APIRouter
from fastapi.responses import Response

from app.core.exceptions import bad_request
from app.dependencies import CurrentUser, DbSession
from app.schemas.party import CreatePartyRequest, JoinPartyRequest, PartyDetailResponse, PartyResponse
from app.services import party as party_service
from app.services import wechat as wechat_service
from app.ws.order_hub import notify_orders_updated

router = APIRouter(tags=["parties"])


@router.post("/families/{family_id}/parties", response_model=PartyDetailResponse)
async def start_party(
    family_id: int,
    body: CreatePartyRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> dict:
    result = party_service.start_party(db, family_id, current_user.id, body.name)
    await notify_orders_updated(family_id)
    return result


@router.get("/families/{family_id}/parties/active", response_model=PartyDetailResponse | None)
def get_active_party(
    family_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> dict | None:
    return party_service.get_active_party(db, family_id, current_user.id)


@router.get("/parties/mine", response_model=PartyDetailResponse | None)
def get_my_party(current_user: CurrentUser, db: DbSession) -> dict | None:
    return party_service.get_my_active_party(db, current_user.id)


@router.post("/parties/join", response_model=PartyDetailResponse)
async def join_party(
    body: JoinPartyRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> dict:
    result = party_service.join_party(db, current_user, body.join_code)
    await notify_orders_updated(result["family_id"])
    return result


@router.get("/parties/{party_id}/wxacode")
async def get_party_wxacode(
    party_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> Response:
    """Return a QR code PNG for the party.
    - If WeChat credentials are configured: returns official Mini Program code.
    - Otherwise: returns a plain QR code encoding the join URL.
    """
    party = party_service._get_party(db, party_id)
    party_service.require_family_access(db, party.family_id, current_user.id)

    # 优先尝试官方小程序码
    try:
        image_bytes = await wechat_service.generate_party_wxacode(party.join_code)
        return Response(
            content=image_bytes,
            media_type="image/png",
            headers={"X-QR-Type": "wxacode"},
        )
    except RuntimeError:
        pass

    # 回退：普通二维码，仅能在小程序内扫码识别
    try:
        qr_text = f"kitchenmate://party/{party.join_code}"
        image_bytes = wechat_service.generate_plain_qrcode(qr_text)
        return Response(
            content=image_bytes,
            media_type="image/png",
            headers={"X-QR-Type": "plain"},
        )
    except Exception as exc:
        raise bad_request(f"QR code generation failed: {exc}") from exc


@router.post("/parties/{party_id}/close", response_model=PartyDetailResponse)
async def close_party(
    party_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> dict:
    result = party_service.close_party(db, party_id, current_user.id)
    await notify_orders_updated(result["family_id"])
    return result
