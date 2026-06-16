from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_session
from app.dependencies import get_current_user, require_role
from app.routers.auth import _generate_codigo
from app.schemas.users import CurrentUser, UserAdminUpdate, UserCreate, UserOut, UserUpdate
from app.services.security import hash_password

router = APIRouter(prefix="/api/users", tags=["users"])

# telefono/direccion se descifran en SQL con pgp_sym_decrypt; las queries ya
# devuelven texto plano en las columnas `telefono` y `direccion`.
_USER_SELECT = """
    select u.id, u.email, u.nombre, r.codigo as rol, u.is_active,
           u.created_at, u.updated_at,
           pgp_sym_decrypt(u.telefono_encrypted,  cast(:enc_key as text)) as telefono,
           pgp_sym_decrypt(u.direccion_encrypted, cast(:enc_key as text)) as direccion
    from usuarios u
    join roles r on r.id = u.rol_id
"""


def _to_user_out(row) -> UserOut:
    return UserOut.model_validate(dict(row))


async def _fetch_user(session: AsyncSession, user_id: int) -> UserOut:
    result = await session.execute(
        text(_USER_SELECT + " where u.id = :user_id and u.deleted_at is null"),
        {"user_id": user_id, "enc_key": get_settings().pgcrypto_key},
    )
    row = result.mappings().first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    return _to_user_out(row)


@router.get("/me", response_model=UserOut)
async def me(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> UserOut:
    return await _fetch_user(session, current_user.id)


@router.patch("/me", response_model=UserOut)
async def update_me(
    payload: UserUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> UserOut:
    values = payload.model_dump(exclude_unset=True)
    if not values:
        return await _fetch_user(session, current_user.id)

    enc_key = get_settings().pgcrypto_key
    params: dict = {"user_id": current_user.id, "enc_key": enc_key}
    clauses: list[str] = []
    if "nombre" in values:
        params["nombre"] = values["nombre"]
        clauses.append("nombre = :nombre")
    if "telefono" in values:
        params["telefono"] = values["telefono"]
        clauses.append(
            "telefono_encrypted = case when cast(:telefono as text) is null then null "
            "else pgp_sym_encrypt(cast(:telefono as text), cast(:enc_key as text)) end"
        )
    if "direccion" in values:
        params["direccion"] = values["direccion"]
        clauses.append(
            "direccion_encrypted = case when cast(:direccion as text) is null then null "
            "else pgp_sym_encrypt(cast(:direccion as text), cast(:enc_key as text)) end"
        )

    await session.execute(
        text(
            f"""
            update usuarios
            set {", ".join(clauses)}
            where id = :user_id
              and deleted_at is null
            """
        ),
        params,
    )
    await session.commit()
    return await _fetch_user(session, current_user.id)


@router.get("", response_model=list[UserOut])
async def list_users(
    rol: str | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    current_user: CurrentUser = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> list[UserOut]:
    params: dict = {"enc_key": get_settings().pgcrypto_key}
    filters = ["u.deleted_at is null"]
    if rol is not None:
        filters.append("r.codigo = :rol")
        params["rol"] = rol
    if is_active is not None:
        filters.append("u.is_active = :is_active")
        params["is_active"] = is_active

    result = await session.execute(
        text(
            _USER_SELECT
            + " where "
            + " and ".join(filters)
            + " order by u.created_at desc, u.id desc limit 100"
        ),
        params,
    )
    return [_to_user_out(row) for row in result.mappings().all()]


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def admin_create_user(
    payload: UserCreate,
    current_user: CurrentUser = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> UserOut:
    """Admin: registra un nuevo usuario (productor/consumidor) sin cambiar la sesión."""
    existing = await session.execute(
        text("select id from usuarios where lower(email) = lower(:email) and deleted_at is null"),
        {"email": payload.email},
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El email ya esta registrado")

    enc_key = get_settings().pgcrypto_key
    insert_sql = text(
        """
        insert into usuarios
            (rol_id, codigo, nombre, email, password_hash, telefono_encrypted, direccion_encrypted)
        values (
            (select id from roles where codigo = :rol),
            :codigo, :nombre, :email, :password_hash,
            case when cast(:telefono as text)  is null then null
                 else pgp_sym_encrypt(cast(:telefono as text),  cast(:enc_key as text)) end,
            case when cast(:direccion as text) is null then null
                 else pgp_sym_encrypt(cast(:direccion as text), cast(:enc_key as text)) end
        )
        returning id
        """
    )
    params = {
        "rol": payload.rol,
        "nombre": payload.nombre,
        "email": str(payload.email).lower(),
        "password_hash": hash_password(payload.password),
        "telefono": payload.telefono,
        "direccion": payload.direccion,
        "enc_key": enc_key,
    }
    new_id = None
    for _ in range(5):
        try:
            result = await session.execute(insert_sql, {**params, "codigo": _generate_codigo(payload.rol)})
            new_id = result.scalar_one()
            await session.commit()
            break
        except IntegrityError:
            await session.rollback()
            continue
    if new_id is None:
        raise HTTPException(status_code=500, detail="No se pudo generar un codigo de usuario unico")
    return await _fetch_user(session, new_id)


@router.patch("/{user_id}", response_model=UserOut)
async def admin_update_user(
    user_id: int,
    payload: UserAdminUpdate,
    current_user: CurrentUser = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> UserOut:
    """Admin: dar de baja / reactivar (is_active) o editar datos de un usuario."""
    values = payload.model_dump(exclude_unset=True)
    if not values:
        return await _fetch_user(session, user_id)
    # Un usuario dado de baja (is_active = false) no se puede editar: solo se
    # admite el cambio que lo reactiva (is_active = true).
    current = await _fetch_user(session, user_id)
    if not current.is_active and values.get("is_active") is not True:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede editar un usuario dado de baja. Reactívalo primero.",
        )
    if values.get("rol") and values["rol"] != current.rol:
        if current.rol == "admin" and values["rol"] != "admin":
            admin_count = (
                await session.execute(
                    text(
                        """
                        select count(*)
                        from usuarios u
                        join roles r on r.id = u.rol_id
                        where r.codigo = 'admin'
                          and u.is_active = true
                          and u.deleted_at is null
                        """
                    )
                )
            ).scalar_one()
            if admin_count <= 1:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="No se puede cambiar el rol del ultimo administrador activo.",
                )

    enc_key = get_settings().pgcrypto_key
    params: dict = {"user_id": user_id, "enc_key": enc_key}
    clauses: list[str] = []
    if "is_active" in values:
        params["is_active"] = values["is_active"]
        clauses.append("is_active = :is_active")
    if "rol" in values:
        params["rol"] = values["rol"]
        clauses.append("rol_id = (select id from roles where codigo = :rol)")
    if "nombre" in values:
        params["nombre"] = values["nombre"]
        clauses.append("nombre = :nombre")
    if "telefono" in values:
        params["telefono"] = values["telefono"]
        clauses.append(
            "telefono_encrypted = case when cast(:telefono as text) is null then null "
            "else pgp_sym_encrypt(cast(:telefono as text), cast(:enc_key as text)) end"
        )
    if "direccion" in values:
        params["direccion"] = values["direccion"]
        clauses.append(
            "direccion_encrypted = case when cast(:direccion as text) is null then null "
            "else pgp_sym_encrypt(cast(:direccion as text), cast(:enc_key as text)) end"
        )

    result = await session.execute(
        text(f"update usuarios set {', '.join(clauses)} where id = :user_id and deleted_at is null"),
        params,
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    await session.commit()
    return await _fetch_user(session, user_id)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_user(
    user_id: int,
    current_user: CurrentUser = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Admin: eliminar un usuario de forma permanente.

    Si el usuario está referenciado en otra tabla (p. ej. tiene cosechas con
    ON DELETE RESTRICT), la BD rechaza el borrado y devolvemos 409 para que el
    front muestre el modal de 'referenciado en otra tabla'."""
    if user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No puedes eliminar tu propia cuenta")
    try:
        result = await session.execute(
            text("delete from usuarios where id = :user_id"),
            {"user_id": user_id},
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede eliminar: el registro está referenciado en otra tabla.",
        ) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
