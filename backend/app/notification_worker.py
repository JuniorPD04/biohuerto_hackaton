from __future__ import annotations

import asyncio
import json

from sqlalchemy import text

from app.config import get_settings
from app.database import AsyncSessionLocal


async def enqueue_due_alerts() -> None:
    async with AsyncSessionLocal() as session:
        await session.execute(text("""
          insert into notification_outbox(usuario_id,dedupe_key,title,body,target_url,tag)
          select a.usuario_id,
                 'alerta:' || a.id::text || ':' || a.updated_at::text,
                 a.titulo,
                 coalesce(a.descripcion,'Tienes una alerta importante en tu biohuerto.'),
                 '/alertas',
                 'alerta-' || a.id::text
          from alertas a
          left join notification_preferences p on p.usuario_id=a.usuario_id
          where a.usuario_id is not null and a.deleted_at is null and a.estado='pendiente'
            and a.prioridad=3 and a.fecha_programada <= now()
            and coalesce(p.alertas_altas,true)
          on conflict(dedupe_key) do nothing
        """))
        await session.commit()


async def deliver_batch() -> None:
    settings = get_settings()
    if not settings.vapid_private_key:
        return
    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        return

    async with AsyncSessionLocal() as session:
        await session.execute(text("""
          insert into notification_deliveries(outbox_id,subscription_id)
          select o.id,s.id from notification_outbox o
          join push_subscriptions s on s.usuario_id=o.usuario_id and s.is_active
          where o.status in ('pending','error') and o.available_at<=now()
          on conflict(outbox_id,subscription_id) do nothing
        """))
        result = await session.execute(text("""
          select d.id as delivery_id,d.outbox_id,o.title,o.body,o.target_url,o.tag,o.image_url,
                 s.id as subscription_id,
                 pgp_sym_decrypt(s.endpoint_encrypted,:key) as endpoint,
                 pgp_sym_decrypt(s.p256dh_encrypted,:key) as p256dh,
                 pgp_sym_decrypt(s.auth_encrypted,:key) as auth
          from notification_deliveries d
          join notification_outbox o on o.id=d.outbox_id
          join push_subscriptions s on s.id=d.subscription_id and s.is_active
          where d.status in ('pending','error') and d.available_at<=now() and d.attempts<5
          order by o.created_at limit 25
        """), {"key": settings.pgcrypto_key})
        rows = result.mappings().all()
        for row in rows:
            payload = json.dumps({"title": row["title"], "body": row["body"],
                                  "url": row["target_url"], "tag": row["tag"],
                                  "image": row["image_url"]})
            try:
                await asyncio.to_thread(
                    webpush,
                    subscription_info={"endpoint": row["endpoint"], "keys": {"p256dh": row["p256dh"], "auth": row["auth"]}},
                    data=payload,
                    vapid_private_key=settings.vapid_private_key,
                    vapid_claims={"sub": settings.vapid_subject},
                )
                await session.execute(text("update push_subscriptions set failure_count=0,last_success_at=now() where id=:id"), {"id": row["subscription_id"]})
                await session.execute(text("update notification_deliveries set status='sent',processed_at=now() where id=:id"), {"id": row["delivery_id"]})
            except WebPushException as exc:
                status_code = getattr(exc.response, "status_code", None)
                if status_code in {404, 410}:
                    await session.execute(text("update push_subscriptions set is_active=false,updated_at=now() where id=:id"), {"id": row["subscription_id"]})
                await session.execute(text("""
                  update notification_deliveries set status='error',attempts=attempts+1,
                    available_at=now()+((attempts+1)*interval '2 minutes'),last_error=:error where id=:id
                """), {"id": row["delivery_id"], "error": str(exc)[:1000]})
        await session.execute(text("""
          update notification_outbox o set status='sent',processed_at=now()
          where o.status<>'sent'
            and exists(select 1 from notification_deliveries d where d.outbox_id=o.id)
            and not exists(select 1 from notification_deliveries d where d.outbox_id=o.id and d.status<>'sent')
        """))
        await session.commit()


async def main() -> None:
    settings = get_settings()
    while True:
        try:
            await enqueue_due_alerts()
            await deliver_batch()
        except Exception as exc:
            print(f"notification worker: {exc}", flush=True)
        await asyncio.sleep(settings.notification_worker_interval_seconds)


if __name__ == "__main__":
    asyncio.run(main())
