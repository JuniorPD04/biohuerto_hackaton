from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import require_role
from app.schemas.autoconsumo import AutoconsumoCreate, AutoconsumoOut
from app.schemas.users import CurrentUser

router = APIRouter(prefix="/api/autoconsumos", tags=["autoconsumos"])

_SELECT = """
    select a.id::text, a.cosecha_id::text, a.usuario_id, a.nombre_producto, a.cultivo,
           a.cantidad, a.unidad_id, un.codigo as unidad, a.fecha, a.notas, a.created_at
    from autoconsumos a
    left join unidades un on un.id = a.unidad_id
"""


@router.post("", response_model=AutoconsumoOut, status_code=status.HTTP_201_CREATED)
async def create_autoconsumo(
    payload: AutoconsumoCreate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> AutoconsumoOut:
    cosecha = (
        await session.execute(
            text(
                """
                select id, usuario_id, nombre_producto, estado, cantidad, unidad_id, cultivo_id
                from cosechas
                where id = :id and deleted_at is null
                for update
                """
            ),
            {"id": payload.cosecha_id},
        )
    ).mappings().first()
    if cosecha is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")
    if current_user.rol != "admin" and cosecha["usuario_id"] != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes registrar autoconsumo de este producto")
    if cosecha["cantidad"] < payload.cantidad:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Stock insuficiente para \"{cosecha['nombre_producto']}\" (disponible: {cosecha['cantidad']})",
        )

    cultivo_nombre = None
    if cosecha["cultivo_id"] is not None:
        cultivo_nombre = (
            await session.execute(
                text("select e.nombre from cultivos c join especies e on e.id = c.especie_id where c.id = :id"),
                {"id": cosecha["cultivo_id"]},
            )
        ).scalar_one_or_none()

    result = await session.execute(
        text(
            """
            insert into autoconsumos (cosecha_id, usuario_id, nombre_producto, cultivo, cantidad, unidad_id, fecha, notas)
            values (:cosecha_id, :usuario_id, :nombre_producto, :cultivo, :cantidad, :unidad_id, coalesce(:fecha, CURRENT_DATE), :notas)
            returning id
            """
        ),
        {
            "cosecha_id": cosecha["id"],
            "usuario_id": cosecha["usuario_id"],
            "nombre_producto": cosecha["nombre_producto"],
            "cultivo": cultivo_nombre,
            "cantidad": payload.cantidad,
            "unidad_id": cosecha["unidad_id"],
            "fecha": payload.fecha,
            "notas": payload.notas,
        },
    )
    new_id = result.scalar_one()

    await session.execute(
        text(
            """
            update cosechas
            set cantidad = cantidad - :cantidad,
                estado = case when cantidad - :cantidad <= 0 then 'agotado' else estado end
            where id = :id
            """
        ),
        {"cantidad": payload.cantidad, "id": cosecha["id"]},
    )
    await session.commit()

    row = await session.execute(text(_SELECT + " where a.id = :id"), {"id": new_id})
    return AutoconsumoOut.model_validate(dict(row.mappings().one()))


@router.get("", response_model=list[AutoconsumoOut])
async def list_autoconsumos(
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    usuario_id: int | None = None,
    cosecha_id: str | None = None,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> list[AutoconsumoOut]:
    filters = ["a.deleted_at is null"]
    params: dict = {}
    if current_user.rol != "admin":
        filters.append("a.usuario_id = :usuario_id")
        params["usuario_id"] = current_user.id
    elif usuario_id is not None:
        filters.append("a.usuario_id = :usuario_id")
        params["usuario_id"] = usuario_id
    if cosecha_id is not None:
        filters.append("a.cosecha_id = :cosecha_id")
        params["cosecha_id"] = cosecha_id
    if fecha_desde is not None:
        filters.append("a.fecha >= :fecha_desde")
        params["fecha_desde"] = fecha_desde
    if fecha_hasta is not None:
        filters.append("a.fecha <= :fecha_hasta")
        params["fecha_hasta"] = fecha_hasta

    result = await session.execute(
        text(_SELECT + " where " + " and ".join(filters) + " order by a.fecha desc, a.created_at desc"),
        params,
    )
    return [AutoconsumoOut.model_validate(dict(row)) for row in result.mappings().all()]
