import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user, require_role
from app.routers.biohuertos import _ensure_biohuerto_access
from app.schemas.cultivos import CultivoCreate, CultivoHistorial, CultivoOut, CultivoUpdate
from app.schemas.users import CurrentUser
from app.services.attachments import set_principal_image

router = APIRouter(prefix="/api/cultivos", tags=["cultivos"])

_CULTIVO_SELECT = """
    select c.id::text, c.biohuerto_id::text, b.nombre as biohuerto_nombre, c.usuario_id,
           e.nombre as especie, c.especie_id, c.variedad,
           c.etapa_id, ef.codigo as etapa, ef.nombre as etapa_nombre,
           c.fecha_siembra, c.fecha_estimada_cosecha, c.cantidad,
           un.codigo as unidad, c.unidad_id,
           c.area_m2, c.celda_fila, c.celda_columna,
           coalesce(
             (
               select jsonb_agg(jsonb_build_object('fila', cc.fila, 'columna', cc.columna) order by cc.fila, cc.columna)
               from cultivo_celdas cc
               where cc.cultivo_id = c.id
                 and cc.deleted_at is null
             ),
             case when c.celda_fila is not null and c.celda_columna is not null
                  then jsonb_build_array(jsonb_build_object('fila', c.celda_fila, 'columna', c.celda_columna))
                  else '[]'::jsonb
             end
           ) as celdas,
           c.campania_id, cmp.nombre as campania, c.notas, c.is_active,
           (select 'data:' || a.mime_type || ';base64,' || replace(encode(a.datos, 'base64'), E'\n', '')
              from archivos_adjuntos a
             where a.cultivo_id = c.id and a.es_principal
             order by a.created_at desc limit 1) as imagen,
           c.created_at, c.updated_at
    from cultivos c
    join etapas_fenologicas ef on ef.id = c.etapa_id
    join especies e on e.id = c.especie_id
    left join unidades un on un.id = c.unidad_id
    left join biohuertos b on b.id = c.biohuerto_id
    left join campanias cmp on cmp.id = c.campania_id
"""


def _to_cultivo_out(row) -> CultivoOut:
    data = dict(row)
    data["id"] = str(data["id"])
    if data.get("biohuerto_id") is not None:
        data["biohuerto_id"] = str(data["biohuerto_id"])
    if isinstance(data.get("celdas"), str):
        data["celdas"] = json.loads(data["celdas"])
    return CultivoOut.model_validate(data)


def _payload_celdas(payload: CultivoCreate | CultivoUpdate, current_row=None) -> list[dict] | None:
    if payload.celdas is not None:
        return [{"fila": c.fila, "columna": c.columna} for c in payload.celdas]
    fila = payload.celda_fila
    columna = payload.celda_columna
    if fila is not None or columna is not None:
        if fila is None or columna is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Debes indicar fila y columna de la celda.",
            )
        return [{"fila": fila, "columna": columna}]
    if current_row is not None:
        current_celdas = current_row.get("celdas") or []
        if isinstance(current_celdas, str):
            current_celdas = json.loads(current_celdas)
        return current_celdas
    return None


async def _fetch_cultivo_row(session: AsyncSession, cultivo_id: UUID):
    result = await session.execute(
        text(_CULTIVO_SELECT + " where c.id = :id and c.deleted_at is null"),
        {"id": cultivo_id},
    )
    return result.mappings().first()


async def _ensure_cultivo_access(session: AsyncSession, cultivo_id: UUID, current_user: CurrentUser):
    row = await _fetch_cultivo_row(session, cultivo_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cultivo no encontrado")
    if current_user.rol == "admin":
        return row
    if current_user.rol != "productor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes acceder a este cultivo")
    if str(row["usuario_id"]) == str(current_user.id):
        return row
    access = await session.execute(
        text(
            """
            select 1 from (
              select 1 from biohuertos b
              where b.id = :biohuerto_id
                and b.es_publico = true
                and b.deleted_at is null
              union all
              select 1 from biohuerto_propietarios bp
              where bp.biohuerto_id = :biohuerto_id
                and bp.propietario_id = :user_id
                and bp.is_active = true
                and bp.deleted_at is null
            ) t limit 1
            """
        ),
        {"biohuerto_id": row["biohuerto_id"], "user_id": current_user.id},
    )
    if access.first() is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes acceder a este cultivo")
    return row


async def _validate_celdas(
    session: AsyncSession,
    biohuerto_id: str,
    celdas: list[dict] | None,
    exclude_cultivo_id: UUID | None = None,
) -> None:
    if not celdas:
        return
    seen = set()
    for celda in celdas:
        key = (int(celda["fila"]), int(celda["columna"]))
        if key in seen:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="No puedes seleccionar la misma celda mas de una vez.",
            )
        seen.add(key)
    grid = (
        await session.execute(
            text(
                """
                select grid_filas, grid_columnas
                from biohuertos
                where id = :biohuerto_id
                  and deleted_at is null
                """
            ),
            {"biohuerto_id": biohuerto_id},
        )
    ).mappings().first()
    if grid is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Biohuerto no encontrado")
    for fila, columna in seen:
        if fila > grid["grid_filas"] or columna > grid["grid_columnas"]:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="La celda esta fuera del mapa del biohuerto.",
            )
        params = {"biohuerto_id": biohuerto_id, "fila": fila, "columna": columna}
        exclude_celdas = ""
        exclude_legacy = ""
        if exclude_cultivo_id is not None:
            exclude_celdas = "and cc.cultivo_id <> :exclude_id"
            exclude_legacy = "and c.id <> :exclude_id"
            params["exclude_id"] = exclude_cultivo_id
        occupied = await session.execute(
            text(
                f"""
                select 1
                from cultivo_celdas cc
                join cultivos c on c.id = cc.cultivo_id
                where cc.biohuerto_id = :biohuerto_id
                  and cc.fila = :fila
                  and cc.columna = :columna
                  and cc.deleted_at is null
                  and c.is_active = true
                  and c.deleted_at is null
                  {exclude_celdas}
                union all
                select 1
                from cultivos c
                where c.biohuerto_id = :biohuerto_id
                  and c.celda_fila = :fila
                  and c.celda_columna = :columna
                  and c.is_active = true
                  and c.deleted_at is null
                  {exclude_legacy}
                limit 1
                """
            ),
            params,
        )
        if occupied.first() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Una de las celdas seleccionadas ya tiene un cultivo activo.",
            )


async def _replace_celdas(
    session: AsyncSession,
    cultivo_id: UUID,
    biohuerto_id: str,
    celdas: list[dict] | None,
) -> None:
    await session.execute(
        text("update cultivo_celdas set deleted_at = now() where cultivo_id = :cultivo_id and deleted_at is null"),
        {"cultivo_id": cultivo_id},
    )
    if not celdas:
        return
    for celda in celdas:
        await session.execute(
            text(
                """
                insert into cultivo_celdas (cultivo_id, biohuerto_id, fila, columna)
                values (:cultivo_id, :biohuerto_id, :fila, :columna)
                on conflict (cultivo_id, fila, columna) do update
                set biohuerto_id = excluded.biohuerto_id,
                    deleted_at = null
                """
            ),
            {
                "cultivo_id": cultivo_id,
                "biohuerto_id": biohuerto_id,
                "fila": celda["fila"],
                "columna": celda["columna"],
            },
        )


async def _ensure_cosecha_for_cultivo(session: AsyncSession, cultivo_id: UUID) -> None:
    """Al pasar un cultivo a etapa 'cosecha', lo agrega a Gestión de Cosechas.

    Crea una cosecha 'disponible' asociada al cultivo y su productor, sin duplicar
    si ya existe una para ese cultivo. El precio queda en 0 para que el productor
    lo complete luego. No hace commit: el llamador controla la transacción.
    """
    row = await _fetch_cultivo_row(session, cultivo_id)
    if row is None or row["usuario_id"] is None:
        return

    existing = await session.execute(
        text("select 1 from cosechas where cultivo_id = :id and deleted_at is null limit 1"),
        {"id": cultivo_id},
    )
    if existing.first() is not None:
        return

    nombre = " ".join(p for p in [row["especie"], row["variedad"]] if p) or row["especie"]
    await session.execute(
        text(
            """
            insert into cosechas
                (cultivo_id, usuario_id, nombre_producto, cantidad, unidad_id,
                 precio_referencial, fecha_cosecha, estado)
            values
                (:cultivo_id, :usuario_id, :nombre, :cantidad,
                 coalesce(:unidad_id, (select id from unidades where codigo = 'und')),
                 0, coalesce(:fecha, current_date), 'disponible')
            """
        ),
        {
            "cultivo_id": cultivo_id,
            "usuario_id": row["usuario_id"],
            "nombre": nombre,
            "cantidad": row["cantidad"] if row["cantidad"] is not None else 0,
            "unidad_id": row["unidad_id"],
            "fecha": row["fecha_estimada_cosecha"],
        },
    )


@router.get("", response_model=list[CultivoOut])
async def list_cultivos(
    biohuerto_id: str | None = None,
    etapa: str | None = None,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[CultivoOut]:
    params: dict = {}
    filters = ["c.deleted_at is null"]
    if biohuerto_id is not None:
        filters.append("c.biohuerto_id = :biohuerto_id")
        params["biohuerto_id"] = biohuerto_id
    if etapa is not None:
        filters.append("ef.codigo = :etapa")
        params["etapa"] = etapa
    if current_user.rol == "productor":
        filters.append(
            """
            (
              c.usuario_id = :user_id
              or exists (
                select 1 from biohuertos b
                where b.id = c.biohuerto_id
                  and b.es_publico = true
                  and b.deleted_at is null
              )
              or exists (
                select 1
                from biohuerto_propietarios bp
                where bp.biohuerto_id = c.biohuerto_id
                  and bp.propietario_id = :user_id
                  and bp.is_active = true
                  and bp.deleted_at is null
              )
            )
            """
        )
        params["user_id"] = current_user.id
    elif current_user.rol != "admin":
        filters.append("false")

    result = await session.execute(
        text(_CULTIVO_SELECT + " where " + " and ".join(filters) + " order by c.created_at desc"),
        params,
    )
    return [_to_cultivo_out(row) for row in result.mappings().all()]


@router.post("", response_model=CultivoOut, status_code=status.HTTP_201_CREATED)
async def create_cultivo(
    payload: CultivoCreate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> CultivoOut:
    await _ensure_biohuerto_access(session, payload.biohuerto_id, current_user)
    celdas = _payload_celdas(payload)
    await _validate_celdas(session, payload.biohuerto_id, celdas)
    result = await session.execute(
        text(
            """
            insert into cultivos (
              biohuerto_id, usuario_id, etapa_id, campania_id, especie_id, variedad,
              fecha_siembra, fecha_estimada_cosecha, cantidad, unidad_id, area_m2,
              celda_fila, celda_columna, notas
            )
            values (
              :biohuerto_id, :usuario_id,
              (select id from etapas_fenologicas where codigo = :etapa),
              (select id from campanias where nombre = :campania),
              :especie_id, :variedad, :fecha_siembra, :fecha_estimada_cosecha,
              :cantidad,
              coalesce(:unidad_id, (select id from unidades where codigo = 'und')),
              :area_m2, :celda_fila, :celda_columna, :notas
            )
            returning id
            """
        ),
        {
            "biohuerto_id": payload.biohuerto_id,
            "usuario_id": current_user.id,
            "etapa": payload.etapa,
            "campania": payload.campania,
            "especie_id": payload.especie_id,
            "variedad": payload.variedad,
            "fecha_siembra": payload.fecha_siembra,
            "fecha_estimada_cosecha": payload.fecha_estimada_cosecha,
            "cantidad": payload.cantidad,
            "unidad_id": payload.unidad_id,
            "area_m2": payload.area_m2,
            "celda_fila": payload.celda_fila,
            "celda_columna": payload.celda_columna,
            "notas": payload.notas,
        },
    )
    new_id = result.scalar_one()
    await _replace_celdas(session, new_id, payload.biohuerto_id, celdas)
    await set_principal_image(session, column="cultivo_id", entity_id=new_id, data_url=payload.imagen)
    if payload.etapa == "cosecha":
        await _ensure_cosecha_for_cultivo(session, new_id)
    await session.commit()
    row = await _fetch_cultivo_row(session, new_id)
    return _to_cultivo_out(row)


@router.get("/{cultivo_id}", response_model=CultivoOut)
async def get_cultivo(
    cultivo_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> CultivoOut:
    row = await _ensure_cultivo_access(session, cultivo_id, current_user)
    return _to_cultivo_out(row)


@router.patch("/{cultivo_id}", response_model=CultivoOut)
async def update_cultivo(
    cultivo_id: UUID,
    payload: CultivoUpdate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> CultivoOut:
    current = await _ensure_cultivo_access(session, cultivo_id, current_user)
    values = payload.model_dump(exclude_unset=True)
    if not values:
        row = await _fetch_cultivo_row(session, cultivo_id)
        return _to_cultivo_out(row)
    # Un cultivo dado de baja (is_active = false) no se puede editar: solo se
    # admite el cambio que lo reactiva (is_active = true).
    if not current["is_active"] and values.get("is_active") is not True:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede editar un cultivo dado de baja. Reactívalo primero.",
        )

    target_biohuerto_id = values.get("biohuerto_id", current["biohuerto_id"])
    if "biohuerto_id" in values:
        await _ensure_biohuerto_access(session, values["biohuerto_id"], current_user)
    celdas_changed = "celdas" in values or "celda_fila" in values or "celda_columna" in values or "biohuerto_id" in values
    target_celdas = _payload_celdas(payload, current)
    if target_celdas:
        values["celda_fila"] = target_celdas[0]["fila"]
        values["celda_columna"] = target_celdas[0]["columna"]
    elif "celdas" in values:
        values["celda_fila"] = None
        values["celda_columna"] = None
    target_active = values.get("is_active", current["is_active"])
    if target_active:
        await _validate_celdas(session, target_biohuerto_id, target_celdas, cultivo_id)

    params: dict = {"id": cultivo_id}
    clauses: list[str] = []
    simple_fields = {
        "biohuerto_id",
        "especie_id",
        "variedad",
        "fecha_siembra",
        "fecha_estimada_cosecha",
        "cantidad",
        "unidad_id",
        "area_m2",
        "celda_fila",
        "celda_columna",
        "notas",
        "is_active",
    }
    for field in simple_fields:
        if field in values:
            params[field] = values[field]
            clauses.append(f"{field} = :{field}")
    if "etapa" in values:
        params["etapa"] = values["etapa"]
        clauses.append("etapa_id = (select id from etapas_fenologicas where codigo = :etapa)")
    if "campania" in values:
        params["campania"] = values["campania"]
        clauses.append("campania_id = (select id from campanias where nombre = :campania)")

    if clauses:
        await session.execute(
            text(f"update cultivos set {', '.join(clauses)} where id = :id and deleted_at is null"),
            params,
        )
    if target_active and celdas_changed:
        await _replace_celdas(session, cultivo_id, target_biohuerto_id, target_celdas)
    elif values.get("is_active") is False:
        await _replace_celdas(session, cultivo_id, target_biohuerto_id, [])
    if "imagen" in values:
        await set_principal_image(
            session, column="cultivo_id", entity_id=cultivo_id, data_url=values["imagen"]
        )
    if values.get("etapa") == "cosecha":
        await _ensure_cosecha_for_cultivo(session, cultivo_id)
    await session.commit()
    row = await _fetch_cultivo_row(session, cultivo_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cultivo no encontrado")
    return _to_cultivo_out(row)


@router.delete("/{cultivo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cultivo(
    cultivo_id: UUID,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> Response:
    await _ensure_cultivo_access(session, cultivo_id, current_user)
    await session.execute(
        text("update cultivo_celdas set deleted_at = now() where cultivo_id = :id and deleted_at is null"),
        {"id": cultivo_id},
    )
    await session.execute(
        text("update cultivos set deleted_at = now() where id = :id and deleted_at is null"),
        {"id": cultivo_id},
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{cultivo_id}/historial", response_model=CultivoHistorial)
async def get_cultivo_historial(
    cultivo_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> CultivoHistorial:
    cultivo_row = await _ensure_cultivo_access(session, cultivo_id, current_user)
    historial = await session.execute(
        text(
            """
            select h.id, ef.codigo as etapa, ef.nombre as etapa_nombre,
                   h.fecha, h.titulo, h.observacion
            from cultivos_historial_etapas h
            join etapas_fenologicas ef on ef.id = h.etapa_id
            where h.cultivo_id = :cultivo_id
            order by h.fecha desc, h.id desc
            """
        ),
        {"cultivo_id": cultivo_id},
    )
    return CultivoHistorial(
        cultivo=_to_cultivo_out(cultivo_row),
        historial=[dict(row) for row in historial.mappings().all()],
    )
