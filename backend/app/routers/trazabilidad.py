from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user, require_role
from app.routers.biohuertos import _ensure_biohuerto_access
from app.routers.cultivos import _ensure_cultivo_access
from app.schemas.trazabilidad import CostoCreate, CostoOut, PracticaCreate, PracticaOut, TrazabilidadResumen
from app.schemas.users import CurrentUser

router = APIRouter(prefix="/api/trazabilidad", tags=["trazabilidad"])


def _decimal(value) -> Decimal:
    return Decimal(str(value or 0))


def _to_practica_out(row) -> PracticaOut:
    return PracticaOut.model_validate(dict(row))


def _to_costo_out(row) -> CostoOut:
    return CostoOut.model_validate(dict(row))


async def _validate_scope(
    session: AsyncSession,
    current_user: CurrentUser,
    biohuerto_id: int,
    cultivo_id: UUID | None,
) -> None:
    await _ensure_biohuerto_access(session, biohuerto_id, current_user)
    if cultivo_id is not None:
        cultivo = await _ensure_cultivo_access(session, cultivo_id, current_user)
        if cultivo["biohuerto_id"] != biohuerto_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El cultivo no pertenece al biohuerto indicado",
            )


@router.post("/practicas", response_model=PracticaOut, status_code=status.HTTP_201_CREATED)
async def create_practica(
    payload: PracticaCreate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> PracticaOut:
    await _validate_scope(session, current_user, payload.biohuerto_id, payload.cultivo_id)
    result = await session.execute(
        text(
            """
            insert into trazabilidad_practicas (
              biohuerto_id, cultivo_id, user_id, tipo_practica, descripcion,
              insumo, cantidad, unidad, fecha_aplicacion, es_sostenible
            )
            values (
              :biohuerto_id, :cultivo_id, :user_id, :tipo_practica, :descripcion,
              :insumo, :cantidad, :unidad, :fecha_aplicacion, :es_sostenible
            )
            returning id, biohuerto_id, cultivo_id, user_id, tipo_practica, descripcion,
                      insumo, cantidad, unidad, fecha_aplicacion, es_sostenible,
                      created_at, updated_at
            """
        ),
        {
            "biohuerto_id": payload.biohuerto_id,
            "cultivo_id": payload.cultivo_id,
            "user_id": current_user.id,
            "tipo_practica": payload.tipo_practica,
            "descripcion": payload.descripcion,
            "insumo": payload.insumo,
            "cantidad": payload.cantidad,
            "unidad": payload.unidad,
            "fecha_aplicacion": payload.fecha_aplicacion,
            "es_sostenible": payload.es_sostenible,
        },
    )
    await session.commit()
    return _to_practica_out(result.mappings().one())


@router.get("/practicas", response_model=list[PracticaOut])
async def list_practicas(
    biohuerto_id: int | None = None,
    cultivo_id: UUID | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[PracticaOut]:
    params: dict = {"limit": limit}
    filters = ["deleted_at is null"]
    if current_user.rol != "admin":
        filters.append("user_id = :user_id")
        params["user_id"] = current_user.id
    if biohuerto_id is not None:
        await _ensure_biohuerto_access(session, biohuerto_id, current_user)
        filters.append("biohuerto_id = :biohuerto_id")
        params["biohuerto_id"] = biohuerto_id
    if cultivo_id is not None:
        await _ensure_cultivo_access(session, cultivo_id, current_user)
        filters.append("cultivo_id = :cultivo_id")
        params["cultivo_id"] = cultivo_id

    result = await session.execute(
        text(
            f"""
            select id, biohuerto_id, cultivo_id, user_id, tipo_practica, descripcion,
                   insumo, cantidad, unidad, fecha_aplicacion, es_sostenible,
                   created_at, updated_at
            from trazabilidad_practicas
            where {" and ".join(filters)}
            order by fecha_aplicacion desc, created_at desc
            limit :limit
            """
        ),
        params,
    )
    return [_to_practica_out(row) for row in result.mappings().all()]


@router.post("/costos", response_model=CostoOut, status_code=status.HTTP_201_CREATED)
async def create_costo(
    payload: CostoCreate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> CostoOut:
    await _validate_scope(session, current_user, payload.biohuerto_id, payload.cultivo_id)
    result = await session.execute(
        text(
            """
            insert into costeo_registros (
              biohuerto_id, cultivo_id, user_id, categoria, descripcion, monto, moneda, fecha
            )
            values (
              :biohuerto_id, :cultivo_id, :user_id, :categoria, :descripcion, :monto, :moneda, :fecha
            )
            returning id, biohuerto_id, cultivo_id, user_id, categoria, descripcion,
                      monto, moneda, fecha, created_at, updated_at
            """
        ),
        {
            "biohuerto_id": payload.biohuerto_id,
            "cultivo_id": payload.cultivo_id,
            "user_id": current_user.id,
            "categoria": payload.categoria,
            "descripcion": payload.descripcion,
            "monto": payload.monto,
            "moneda": payload.moneda,
            "fecha": payload.fecha,
        },
    )
    await session.commit()
    return _to_costo_out(result.mappings().one())


@router.get("/costos", response_model=list[CostoOut])
async def list_costos(
    biohuerto_id: int | None = None,
    cultivo_id: UUID | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[CostoOut]:
    params: dict = {"limit": limit}
    filters = ["deleted_at is null"]
    if current_user.rol != "admin":
        filters.append("user_id = :user_id")
        params["user_id"] = current_user.id
    if biohuerto_id is not None:
        await _ensure_biohuerto_access(session, biohuerto_id, current_user)
        filters.append("biohuerto_id = :biohuerto_id")
        params["biohuerto_id"] = biohuerto_id
    if cultivo_id is not None:
        await _ensure_cultivo_access(session, cultivo_id, current_user)
        filters.append("cultivo_id = :cultivo_id")
        params["cultivo_id"] = cultivo_id

    result = await session.execute(
        text(
            f"""
            select id, biohuerto_id, cultivo_id, user_id, categoria, descripcion,
                   monto, moneda, fecha, created_at, updated_at
            from costeo_registros
            where {" and ".join(filters)}
            order by fecha desc, created_at desc
            limit :limit
            """
        ),
        params,
    )
    return [_to_costo_out(row) for row in result.mappings().all()]


@router.get("/biohuertos/{biohuerto_id}/resumen", response_model=TrazabilidadResumen)
async def get_resumen_trazabilidad(
    biohuerto_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> TrazabilidadResumen:
    await _ensure_biohuerto_access(session, biohuerto_id, current_user)

    practicas = await session.execute(
        text(
            """
            select count(*)::int as total,
                   count(*) filter (where es_sostenible = true)::int as sostenibles
            from trazabilidad_practicas
            where biohuerto_id = :biohuerto_id
              and deleted_at is null
            """
        ),
        {"biohuerto_id": biohuerto_id},
    )
    row = practicas.mappings().first() or {}
    total = int(row.get("total") or 0)
    sostenibles = int(row.get("sostenibles") or 0)
    porcentaje = (Decimal(sostenibles) * Decimal("100") / Decimal(total)).quantize(Decimal("0.01")) if total else Decimal("0")

    costos = await session.execute(
        text(
            """
            select categoria, coalesce(sum(monto), 0) as total
            from costeo_registros
            where biohuerto_id = :biohuerto_id
              and deleted_at is null
            group by categoria
            order by categoria
            """
        ),
        {"biohuerto_id": biohuerto_id},
    )
    costos_por_categoria = {item["categoria"]: _decimal(item["total"]) for item in costos.mappings().all()}
    costos_total = sum(costos_por_categoria.values(), Decimal("0"))

    return TrazabilidadResumen(
        biohuerto_id=biohuerto_id,
        practicas_total=total,
        practicas_sostenibles=sostenibles,
        sostenibilidad_porcentaje=porcentaje,
        costos_total=costos_total,
        costos_por_categoria=costos_por_categoria,
    )

