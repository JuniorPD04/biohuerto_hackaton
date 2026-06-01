from collections.abc import Callable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.schemas.users import CurrentUser
from app.services.security import ACCESS_TOKEN_TYPE, decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_session),
) -> CurrentUser:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales no validas",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token, ACCESS_TOKEN_TYPE)
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, TypeError, ValueError) as exc:
        raise credentials_error from exc

    result = await session.execute(
        text(
            """
            select id, email, nombre, rol, is_active
            from users
            where id = :user_id
              and deleted_at is null
            """
        ),
        {"user_id": user_id},
    )
    row = result.mappings().first()
    if row is None or not row["is_active"]:
        raise credentials_error
    return CurrentUser.model_validate(dict(row))


def require_role(*allowed_roles: str) -> Callable:
    async def dependency(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user.rol not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para esta accion",
            )
        return current_user

    return dependency

