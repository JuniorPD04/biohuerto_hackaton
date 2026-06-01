from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user, require_role
from app.schemas.users import CurrentUser, UserOut, UserUpdate
from app.services.encryption_service import EncryptionConfigurationError, decrypt_optional, encrypt_optional

router = APIRouter(prefix="/api/users", tags=["users"])


def _to_user_out(row) -> UserOut:
    data = dict(row)
    data["telefono"] = decrypt_optional(data.pop("telefono_encrypted", None))
    data["direccion"] = decrypt_optional(data.pop("direccion_encrypted", None))
    data.pop("password_hash", None)
    return UserOut.model_validate(data)


async def _fetch_user(session: AsyncSession, user_id: int) -> UserOut:
    result = await session.execute(
        text(
            """
            select id, email, nombre, rol, is_active, created_at, updated_at,
                   telefono_encrypted, direccion_encrypted
            from users
            where id = :user_id
              and deleted_at is null
            """
        ),
        {"user_id": user_id},
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

    params: dict = {"user_id": current_user.id}
    clauses: list[str] = []
    if "nombre" in values:
        params["nombre"] = values["nombre"]
        clauses.append("nombre = :nombre")
    if "telefono" in values:
        try:
            params["telefono_encrypted"] = encrypt_optional(values["telefono"])
        except EncryptionConfigurationError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        clauses.append("telefono_encrypted = :telefono_encrypted")
    if "direccion" in values:
        try:
            params["direccion_encrypted"] = encrypt_optional(values["direccion"])
        except EncryptionConfigurationError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        clauses.append("direccion_encrypted = :direccion_encrypted")

    result = await session.execute(
        text(
            f"""
            update users
            set {", ".join(clauses)}
            where id = :user_id
              and deleted_at is null
            returning id, email, nombre, rol, is_active, created_at, updated_at,
                      telefono_encrypted, direccion_encrypted
            """
        ),
        params,
    )
    await session.commit()
    row = result.mappings().first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    return _to_user_out(row)


@router.get("", response_model=list[UserOut])
async def list_users(
    current_user: CurrentUser = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> list[UserOut]:
    result = await session.execute(
        text(
            """
            select id, email, nombre, rol, is_active, created_at, updated_at,
                   telefono_encrypted, direccion_encrypted
            from users
            where deleted_at is null
            order by created_at desc, id desc
            limit 100
            """
        )
    )
    return [_to_user_out(row) for row in result.mappings().all()]

