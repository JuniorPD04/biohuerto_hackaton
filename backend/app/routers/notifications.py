import base64
import binascii
import hashlib
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_session
from app.dependencies import get_current_user, require_role
from app.schemas.common import clean_text
from app.schemas.users import CurrentUser

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


class PushKeys(BaseModel):
    p256dh: str = Field(min_length=20)
    auth: str = Field(min_length=8)


class PushSubscriptionPayload(BaseModel):
    endpoint: str = Field(min_length=20, max_length=4096)
    expirationTime: int | None = None
    keys: PushKeys


class SubscriptionCreate(BaseModel):
    device_id: UUID
    subscription: PushSubscriptionPayload
    user_agent: str | None = Field(default=None, max_length=1000)


class NotificationPreferences(BaseModel):
    alertas_altas: bool = True
    cuidados: bool = True
    conflictos: bool = True
    sincronizacion: bool = False


class AdminCampaignCreate(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    body: str = Field(min_length=2, max_length=500)
    audience_type: Literal["specific", "selected", "all"] = "specific"
    recipient_ids: list[int] = Field(default_factory=list, max_length=200)
    target_url: str = Field(default="/", max_length=500)
    image_data_url: str | None = Field(default=None, max_length=2_800_000)
    reuse_image_from: UUID | None = None

    @field_validator("title", "body", mode="before")
    @classmethod
    def sanitize_copy(cls, value: str) -> str:
        return clean_text(value)

    @field_validator("target_url")
    @classmethod
    def validate_target_url(cls, value: str) -> str:
        if not value.startswith("/") or value.startswith("//"):
            raise ValueError("La ruta de destino debe pertenecer a la aplicacion")
        return value


_ALLOWED_IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp"}
_MAX_CAMPAIGN_IMAGE_BYTES = 2 * 1024 * 1024


def _decode_image(data_url: str | None) -> tuple[bytes | None, str | None]:
    if not data_url:
        return None, None
    try:
        header, encoded = data_url.split(",", 1)
        mime = header.removeprefix("data:").split(";", 1)[0].lower()
        if ";base64" not in header or mime not in _ALLOWED_IMAGE_MIMES:
            raise ValueError
        value = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise HTTPException(status_code=422, detail="La imagen adjunta no es valida") from exc
    if len(value) > _MAX_CAMPAIGN_IMAGE_BYTES:
        raise HTTPException(status_code=422, detail="La imagen no debe superar 2 MB")
    return value, mime


async def _resolve_campaign_recipients(
    session: AsyncSession, payload: AdminCampaignCreate
) -> list[int]:
    if payload.audience_type == "all":
        result = await session.execute(
            text("select id from usuarios where is_active=true and deleted_at is null order by id")
        )
        return [int(row[0]) for row in result.all()]

    requested = sorted(set(payload.recipient_ids))
    expected = 1 if payload.audience_type == "specific" else None
    if expected == 1 and len(requested) != 1:
        raise HTTPException(status_code=422, detail="Selecciona exactamente un usuario")
    if payload.audience_type == "selected" and not requested:
        raise HTTPException(status_code=422, detail="Selecciona al menos un usuario")

    params = {f"recipient_{index}": user_id for index, user_id in enumerate(requested)}
    placeholders = ",".join(f":recipient_{index}" for index in range(len(requested)))
    result = await session.execute(
        text(
            f"select id from usuarios where id in ({placeholders}) "
            "and is_active=true and deleted_at is null order by id"
        ),
        params,
    )
    found = [int(row[0]) for row in result.all()]
    if len(found) != len(requested):
        raise HTTPException(status_code=422, detail="Uno o mas destinatarios no estan disponibles")
    return found


@router.post("/subscriptions", status_code=status.HTTP_201_CREATED)
async def save_subscription(
    payload: SubscriptionCreate,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    settings = get_settings()
    endpoint_hash = hashlib.sha256(payload.subscription.endpoint.encode()).hexdigest()
    await session.execute(
        text("""
          insert into push_subscriptions(
            usuario_id,device_uuid,endpoint_hash,endpoint_encrypted,p256dh_encrypted,
            auth_encrypted,user_agent,is_active,failure_count,updated_at
          ) values(
            :uid,:device_uuid,:endpoint_hash,
            pgp_sym_encrypt(:endpoint,:key),pgp_sym_encrypt(:p256dh,:key),
            pgp_sym_encrypt(:auth,:key),:user_agent,true,0,now()
          )
          on conflict(usuario_id,device_uuid) do update set
            endpoint_hash=excluded.endpoint_hash,endpoint_encrypted=excluded.endpoint_encrypted,
            p256dh_encrypted=excluded.p256dh_encrypted,auth_encrypted=excluded.auth_encrypted,
            user_agent=excluded.user_agent,is_active=true,failure_count=0,updated_at=now()
        """),
        {"uid": current_user.id, "device_uuid": payload.device_id,
         "endpoint_hash": endpoint_hash, "endpoint": payload.subscription.endpoint,
         "p256dh": payload.subscription.keys.p256dh, "auth": payload.subscription.keys.auth,
         "user_agent": payload.user_agent, "key": settings.pgcrypto_key},
    )
    await session.execute(
        text("insert into notification_preferences(usuario_id) values(:uid) on conflict(usuario_id) do nothing"),
        {"uid": current_user.id},
    )
    await session.commit()
    return {"device_id": payload.device_id, "active": True}


@router.delete("/subscriptions/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_subscription(
    device_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    await session.execute(
        text("update push_subscriptions set is_active=false,updated_at=now() where usuario_id=:uid and device_uuid=:device"),
        {"uid": current_user.id, "device": device_id},
    )
    await session.commit()


@router.get("/preferences", response_model=NotificationPreferences)
async def get_preferences(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> NotificationPreferences:
    result = await session.execute(
        text("select alertas_altas,cuidados,conflictos,sincronizacion from notification_preferences where usuario_id=:uid"),
        {"uid": current_user.id},
    )
    row = result.mappings().first()
    return NotificationPreferences.model_validate(dict(row)) if row else NotificationPreferences()


@router.put("/preferences", response_model=NotificationPreferences)
async def update_preferences(
    payload: NotificationPreferences,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> NotificationPreferences:
    await session.execute(
        text("""
          insert into notification_preferences(usuario_id,alertas_altas,cuidados,conflictos,sincronizacion)
          values(:uid,:alertas_altas,:cuidados,:conflictos,:sincronizacion)
          on conflict(usuario_id) do update set
            alertas_altas=excluded.alertas_altas,cuidados=excluded.cuidados,
            conflictos=excluded.conflictos,sincronizacion=excluded.sincronizacion,updated_at=now()
        """),
        {"uid": current_user.id, **payload.model_dump()},
    )
    await session.commit()
    return payload


@router.get("/admin/recipients")
async def list_admin_recipients(
    search: str | None = Query(default=None, max_length=120),
    current_user: CurrentUser = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    params: dict[str, Any] = {}
    filters = ["u.is_active=true", "u.deleted_at is null"]
    if search and search.strip():
        params["search"] = f"%{search.strip().lower()}%"
        filters.append("(lower(u.nombre) like :search or lower(u.email) like :search)")
    result = await session.execute(
        text(
            """
            select u.id,u.nombre,u.email,r.codigo as rol,
                   exists(select 1 from push_subscriptions s
                          where s.usuario_id=u.id and s.is_active) as has_subscription
            from usuarios u join roles r on r.id=u.rol_id
            where """
            + " and ".join(filters)
            + " order by u.nombre,u.id limit 500"
        ),
        params,
    )
    return [dict(row) for row in result.mappings().all()]


@router.post("/admin/campaigns", status_code=status.HTTP_201_CREATED)
async def create_admin_campaign(
    payload: AdminCampaignCreate,
    current_user: CurrentUser = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    if not get_settings().vapid_private_key:
        raise HTTPException(status_code=503, detail="Web Push no esta configurado en el servidor")

    recipients = await _resolve_campaign_recipients(session, payload)
    if not recipients:
        raise HTTPException(status_code=422, detail="No hay usuarios activos para notificar")

    image_data, image_mime = _decode_image(payload.image_data_url)
    if image_data is None and payload.reuse_image_from is not None:
        reused = await session.execute(
            text("select image_data,image_mime from notification_campaigns where id=:campaign_id"),
            {"campaign_id": payload.reuse_image_from},
        )
        row = reused.mappings().first()
        if row:
            image_data, image_mime = row["image_data"], row["image_mime"]

    campaign_id = uuid4()
    image_url = (
        f"/api/notifications/public/images/{campaign_id}" if image_data is not None else None
    )
    await session.execute(
        text(
            """
            insert into notification_campaigns(
              id,created_by,audience_type,title,body,target_url,image_data,image_mime
            ) values(
              :id,:created_by,:audience_type,:title,:body,:target_url,:image_data,:image_mime
            )
            """
        ),
        {
            "id": campaign_id,
            "created_by": current_user.id,
            "audience_type": payload.audience_type,
            "title": payload.title,
            "body": payload.body,
            "target_url": payload.target_url,
            "image_data": image_data,
            "image_mime": image_mime,
        },
    )
    await session.execute(
        text(
            "insert into notification_campaign_recipients(campaign_id,usuario_id) "
            "values(:campaign_id,:usuario_id)"
        ),
        [{"campaign_id": campaign_id, "usuario_id": user_id} for user_id in recipients],
    )
    await session.execute(
        text(
            """
            insert into notification_outbox(
              campaign_id,usuario_id,dedupe_key,title,body,target_url,tag,image_url
            ) values(
              :campaign_id,:usuario_id,:dedupe_key,:title,:body,:target_url,:tag,:image_url
            )
            """
        ),
        [
            {
                "campaign_id": campaign_id,
                "usuario_id": user_id,
                "dedupe_key": f"campaign:{campaign_id}:{user_id}",
                "title": payload.title,
                "body": payload.body,
                "target_url": payload.target_url,
                "tag": f"campaign-{campaign_id}",
                "image_url": image_url,
            }
            for user_id in recipients
        ],
    )
    subscribed = await session.execute(
        text(
            """
            select count(distinct usuario_id) from push_subscriptions
            where is_active=true and usuario_id in (
              select usuario_id from notification_campaign_recipients where campaign_id=:campaign_id
            )
            """
        ),
        {"campaign_id": campaign_id},
    )
    subscribed_count = int(subscribed.scalar_one())
    await session.commit()
    return {
        "id": campaign_id,
        "status": "queued",
        "recipient_count": len(recipients),
        "subscribed_recipient_count": subscribed_count,
        "image_url": image_url,
    }


@router.get("/admin/campaigns")
async def list_admin_campaigns(
    limit: int = Query(default=30, ge=1, le=100),
    current_user: CurrentUser = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    result = await session.execute(
        text(
            """
            select c.id,c.audience_type,c.title,c.body,c.target_url,c.created_at,
                   c.image_data is not null as has_image,u.nombre as created_by_name,
                   (select count(*) from notification_campaign_recipients cr
                    where cr.campaign_id=c.id) as recipient_count,
                   (select count(*) from notification_campaign_recipients cr
                    where cr.campaign_id=c.id and exists(
                      select 1 from push_subscriptions s
                      where s.usuario_id=cr.usuario_id and s.is_active
                    )) as subscribed_recipient_count,
                   (select count(*) from notification_outbox o
                    where o.campaign_id=c.id and o.status='sent') as sent_recipient_count,
                   (select count(*) from notification_outbox o
                    where o.campaign_id=c.id and o.status='error') as failed_delivery_count,
                   array(select cr.usuario_id from notification_campaign_recipients cr
                         where cr.campaign_id=c.id order by cr.usuario_id) as recipient_ids
            from notification_campaigns c
            join usuarios u on u.id=c.created_by
            order by c.created_at desc
            limit :limit
            """
        ),
        {"limit": limit},
    )
    campaigns = []
    for row in result.mappings().all():
        item = dict(row)
        subscribed = int(item["subscribed_recipient_count"])
        sent = int(item["sent_recipient_count"])
        failed = int(item["failed_delivery_count"])
        if subscribed == 0:
            item["status"] = "no_subscriptions"
        elif sent >= subscribed:
            item["status"] = "sent"
        elif failed:
            item["status"] = "partial"
        else:
            item["status"] = "queued"
        item["image_url"] = (
            f"/api/notifications/public/images/{item['id']}" if item.pop("has_image") else None
        )
        campaigns.append(item)
    return campaigns


@router.get("/public/images/{campaign_id}", include_in_schema=False)
async def get_campaign_image(
    campaign_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> Response:
    result = await session.execute(
        text("select image_data,image_mime from notification_campaigns where id=:campaign_id"),
        {"campaign_id": campaign_id},
    )
    row = result.mappings().first()
    if not row or row["image_data"] is None:
        raise HTTPException(status_code=404, detail="Imagen no encontrada")
    return Response(
        content=bytes(row["image_data"]),
        media_type=row["image_mime"],
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@router.post("/test", status_code=status.HTTP_202_ACCEPTED)
async def test_notification(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    if not get_settings().vapid_private_key:
        raise HTTPException(status_code=503, detail="Web Push no esta configurado en el servidor")
    await session.execute(
        text("""
          insert into notification_outbox(usuario_id,dedupe_key,title,body,target_url,tag)
          values(:uid,:dedupe,'Notificaciones activas','Biohuerto puede enviarte recordatorios en este dispositivo.','/alertas','push-test')
        """),
        {"uid": current_user.id, "dedupe": f"test:{current_user.id}:{uuid4()}"},
    )
    await session.commit()
    return {"status": "queued"}
