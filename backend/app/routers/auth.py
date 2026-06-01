from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.rate_limit import limiter
from app.schemas.users import AuthResponse, UserCreate, UserLogin, UserOut
from app.services.encryption_service import EncryptionConfigurationError, encrypt_optional
from app.services.security import (
    REFRESH_COOKIE_NAME,
    REFRESH_TOKEN_TYPE,
    clear_refresh_cookie,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    set_refresh_cookie,
    verify_password,
)
from app.config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])


def _public_user(row) -> UserOut:
    data = dict(row)
    data["telefono"] = None
    data["direccion"] = None
    data.pop("password_hash", None)
    data.pop("telefono_encrypted", None)
    data.pop("direccion_encrypted", None)
    return UserOut.model_validate(data)


def _auth_response(row, response: Response) -> AuthResponse:
    user = _public_user(row)
    access_token = create_access_token(subject=user.id, role=user.rol)
    refresh_token = create_refresh_token(subject=user.id, role=user.rol)
    set_refresh_cookie(response, refresh_token)
    settings = get_settings()
    return AuthResponse(
        access_token=access_token,
        expires_in_seconds=settings.access_token_expire_minutes * 60,
        user=user,
    )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def register(
    payload: UserCreate,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> AuthResponse:
    existing = await session.execute(
        text("select id from users where lower(email) = lower(:email) and deleted_at is null"),
        {"email": payload.email},
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El email ya esta registrado")

    try:
        telefono_encrypted = encrypt_optional(payload.telefono)
        direccion_encrypted = encrypt_optional(payload.direccion)
    except EncryptionConfigurationError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    result = await session.execute(
        text(
            """
            insert into users (email, password_hash, nombre, rol, telefono_encrypted, direccion_encrypted)
            values (:email, :password_hash, :nombre, :rol, :telefono_encrypted, :direccion_encrypted)
            returning id, email, nombre, rol, is_active, created_at, updated_at,
                      telefono_encrypted, direccion_encrypted
            """
        ),
        {
            "email": str(payload.email).lower(),
            "password_hash": hash_password(payload.password),
            "nombre": payload.nombre,
            "rol": payload.rol,
            "telefono_encrypted": telefono_encrypted,
            "direccion_encrypted": direccion_encrypted,
        },
    )
    await session.commit()
    row = result.mappings().one()
    return _auth_response(row, response)


@router.post("/login", response_model=AuthResponse)
@limiter.limit("10/minute")
async def login(
    payload: UserLogin,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> AuthResponse:
    result = await session.execute(
        text(
            """
            select id, email, password_hash, nombre, rol, is_active, created_at, updated_at,
                   telefono_encrypted, direccion_encrypted
            from users
            where lower(email) = lower(:email)
              and deleted_at is null
            """
        ),
        {"email": payload.email},
    )
    row = result.mappings().first()
    if row is None or not verify_password(payload.password, row["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email o contrasena invalidos")
    if not row["is_active"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario inactivo")
    return _auth_response(row, response)


@router.post("/refresh", response_model=AuthResponse)
@limiter.limit("10/minute")
async def refresh(
    request: Request,
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
    session: AsyncSession = Depends(get_session),
) -> AuthResponse:
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token ausente")
    try:
        payload = decode_token(refresh_token, REFRESH_TOKEN_TYPE)
        user_id = int(payload["sub"])
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token invalido") from exc

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
    if row is None or not row["is_active"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no valido")
    return _auth_response(row, response)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
async def logout(request: Request, response: Response) -> Response:
    clear_refresh_cookie(response)
    return response

