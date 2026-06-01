from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user, require_role
from app.schemas.biohuertos import BiohuertoCreate, BiohuertoOut, BiohuertoUpdate
from app.schemas.users import CurrentUser
from app.services.encryption_service import EncryptionConfigurationError, decrypt_optional, encrypt_optional

router = APIRouter(prefix="/api/biohuertos", tags=["biohuertos"])


def _to_biohuerto_out(row) -> BiohuertoOut:
    data = dict(row)
    data["ubicacion_referencia"] = decrypt_optional(data.pop("ubicacion_referencia_encrypted", None))
    return BiohuertoOut.model_validate(data)


async def _ensure_biohuerto_access(
    session: AsyncSession,
    biohuerto_id: int,
    current_user: CurrentUser,
) -> None:
    result = await session.execute(
        text("select user_id from biohuertos where id = :id and deleted_at is null"),
        {"id": biohuerto_id},
    )
    row = result.mappings().first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Biohuerto no encontrado")
    if current_user.rol != "admin" and row["user_id"] != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes acceder a este biohuerto")


@router.get("", response_model=list[BiohuertoOut])
async def list_biohuertos(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[BiohuertoOut]:
    if current_user.rol == "admin":
        query = text(
            """
            select id, user_id, nombre, codigo, ubicacion_referencia_encrypted,
                   area_m2, descripcion, created_at, updated_at
            from biohuertos
            where deleted_at is null
            order by created_at desc, id desc
            """
        )
        result = await session.execute(query)
    else:
        query = text(
            """
            select id, user_id, nombre, codigo, ubicacion_referencia_encrypted,
                   area_m2, descripcion, created_at, updated_at
            from biohuertos
            where user_id = :user_id
              and deleted_at is null
            order by created_at desc, id desc
            """
        )
        result = await session.execute(query, {"user_id": current_user.id})
    return [_to_biohuerto_out(row) for row in result.mappings().all()]


@router.post("", response_model=BiohuertoOut, status_code=status.HTTP_201_CREATED)
async def create_biohuerto(
    payload: BiohuertoCreate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> BiohuertoOut:
    owner_id = payload.user_id if current_user.rol == "admin" and payload.user_id else current_user.id

    existing = await session.execute(
        text("select id from biohuertos where lower(codigo) = lower(:codigo) and deleted_at is null"),
        {"codigo": payload.codigo},
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El codigo de biohuerto ya existe")

    try:
        ubicacion_encrypted = encrypt_optional(payload.ubicacion_referencia)
    except EncryptionConfigurationError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    result = await session.execute(
        text(
            """
            insert into biohuertos (user_id, nombre, codigo, ubicacion_referencia_encrypted, area_m2, descripcion)
            values (:user_id, :nombre, :codigo, :ubicacion_encrypted, :area_m2, :descripcion)
            returning id, user_id, nombre, codigo, ubicacion_referencia_encrypted,
                      area_m2, descripcion, created_at, updated_at
            """
        ),
        {
            "user_id": owner_id,
            "nombre": payload.nombre,
            "codigo": payload.codigo.upper(),
            "ubicacion_encrypted": ubicacion_encrypted,
            "area_m2": payload.area_m2,
            "descripcion": payload.descripcion,
        },
    )
    await session.commit()
    return _to_biohuerto_out(result.mappings().one())


@router.get("/{biohuerto_id}", response_model=BiohuertoOut)
async def get_biohuerto(
    biohuerto_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> BiohuertoOut:
    await _ensure_biohuerto_access(session, biohuerto_id, current_user)
    result = await session.execute(
        text(
            """
            select id, user_id, nombre, codigo, ubicacion_referencia_encrypted,
                   area_m2, descripcion, created_at, updated_at
            from biohuertos
            where id = :id
              and deleted_at is null
            """
        ),
        {"id": biohuerto_id},
    )
    return _to_biohuerto_out(result.mappings().one())


@router.patch("/{biohuerto_id}", response_model=BiohuertoOut)
async def update_biohuerto(
    biohuerto_id: int,
    payload: BiohuertoUpdate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> BiohuertoOut:
    await _ensure_biohuerto_access(session, biohuerto_id, current_user)
    values = payload.model_dump(exclude_unset=True)
    if not values:
        return await get_biohuerto(biohuerto_id, current_user, session)

    clauses: list[str] = []
    params: dict = {"id": biohuerto_id}
    if "nombre" in values:
        params["nombre"] = values["nombre"]
        clauses.append("nombre = :nombre")
    if "codigo" in values:
        duplicate = await session.execute(
            text(
                """
                select id from biohuertos
                where lower(codigo) = lower(:codigo)
                  and id <> :id
                  and deleted_at is null
                """
            ),
            {"codigo": values["codigo"], "id": biohuerto_id},
        )
        if duplicate.scalar_one_or_none() is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El codigo de biohuerto ya existe")
        params["codigo"] = values["codigo"].upper()
        clauses.append("codigo = :codigo")
    if "ubicacion_referencia" in values:
        try:
            params["ubicacion_encrypted"] = encrypt_optional(values["ubicacion_referencia"])
        except EncryptionConfigurationError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        clauses.append("ubicacion_referencia_encrypted = :ubicacion_encrypted")
    if "area_m2" in values:
        params["area_m2"] = values["area_m2"]
        clauses.append("area_m2 = :area_m2")
    if "descripcion" in values:
        params["descripcion"] = values["descripcion"]
        clauses.append("descripcion = :descripcion")

    result = await session.execute(
        text(
            f"""
            update biohuertos
            set {", ".join(clauses)}
            where id = :id
              and deleted_at is null
            returning id, user_id, nombre, codigo, ubicacion_referencia_encrypted,
                      area_m2, descripcion, created_at, updated_at
            """
        ),
        params,
    )
    await session.commit()
    row = result.mappings().first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Biohuerto no encontrado")
    return _to_biohuerto_out(row)


@router.delete("/{biohuerto_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_biohuerto(
    biohuerto_id: int,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> Response:
    await _ensure_biohuerto_access(session, biohuerto_id, current_user)
    await session.execute(
        text("update biohuertos set deleted_at = now() where id = :id and deleted_at is null"),
        {"id": biohuerto_id},
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

