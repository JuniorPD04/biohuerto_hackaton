import secrets

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_session
from app.rate_limit import limiter
from app.schemas.users import AuthResponse, UserCreate, UserLogin, UserOut
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

router = APIRouter(prefix="/auth", tags=["auth"])

# Prefijo de codigo de usuario por rol (ADM-0001, PROD-8821, CON-1102, ...)
_ROLE_CODE_PREFIX = {"admin": "ADM", "productor": "PROD", "consumidor": "CON"}


def _generate_codigo(rol: str) -> str:
    prefix = _ROLE_CODE_PREFIX.get(rol, "USR")
    return f"{prefix}-{secrets.randbelow(900000) + 100000}"


def _public_user(row) -> UserOut:
    data = dict(row)
    data.setdefault("telefono", None)
    data.setdefault("direccion", None)
    data.pop("password_hash", None)
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
    settings = get_settings()
    public_role = "consumidor"

    existing = await session.execute(
        text("select id from usuarios where lower(email) = lower(:email) and deleted_at is null"),
        {"email": payload.email},
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El email ya esta registrado")

    insert_sql = text(
        """
        insert into usuarios
            (rol_id, codigo, nombre, email, password_hash,
             telefono_encrypted, direccion_encrypted)
        values (
            (select id from roles where codigo = :rol),
            :codigo,
            :nombre,
            :email,
            :password_hash,
            case when cast(:telefono as text)  is null then null
                 else pgp_sym_encrypt(cast(:telefono as text),  cast(:enc_key as text)) end,
            case when cast(:direccion as text) is null then null
                 else pgp_sym_encrypt(cast(:direccion as text), cast(:enc_key as text)) end
        )
        returning id, email, nombre, is_active, created_at, updated_at
        """
    )

    params = {
        "rol": public_role,
        "nombre": payload.nombre,
        "email": str(payload.email).lower(),
        "password_hash": hash_password(payload.password),
        "telefono": payload.telefono,
        "direccion": payload.direccion,
        "enc_key": settings.pgcrypto_key,
    }

    # Reintenta si el codigo aleatorio colisiona con uno existente (UNIQUE).
    row = None
    for _ in range(5):
        try:
            result = await session.execute(insert_sql, {**params, "codigo": _generate_codigo(public_role)})
            row = result.mappings().one()
            await session.commit()
            break
        except IntegrityError:
            await session.rollback()
            continue
    if row is None:
        raise HTTPException(status_code=500, detail="No se pudo generar un codigo de usuario unico")

    data = dict(row)
    data["rol"] = public_role
    return _auth_response(data, response)


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
            select u.id, u.email, u.password_hash, u.nombre, r.codigo as rol,
                   u.is_active, u.created_at, u.updated_at
            from usuarios u
            join roles r on r.id = u.rol_id
            where lower(u.email) = lower(:email)
              and u.deleted_at is null
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
            select u.id, u.email, u.nombre, r.codigo as rol,
                   u.is_active, u.created_at, u.updated_at
            from usuarios u
            join roles r on r.id = u.rol_id
            where u.id = :user_id
              and u.deleted_at is null
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
