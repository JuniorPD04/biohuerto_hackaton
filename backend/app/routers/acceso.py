"""Control de acceso por rol: vistas, acciones y permisos (RBAC).

Alimenta la pantalla "Roles y accesos": una matriz vista × acción donde el
admin marca qué puede hacer cada rol. Modelo:
  roles ─< rol_permisos >─ vista_acciones (vista_id, accion_id)
La FK compuesta de rol_permisos garantiza que solo se concede una acción
declarada aplicable a esa vista (vista_acciones).
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user, require_role
from app.schemas.users import CurrentUser

router = APIRouter(prefix="/api/acceso", tags=["acceso"])

# Orden lógico de columnas (acción) en la matriz; las que no estén aquí
# se muestran al final en orden de id.
_ACCION_ORDEN = [
    "ver_lista", "ver_detalle", "crear", "editar",
    "eliminar", "dar_baja", "restaurar", "buscar", "exportar",
]

_ROL_NOMBRE = {"admin": "Administrador", "productor": "Productor", "consumidor": "Consumidor"}


class PermisosPayload(BaseModel):
    """Conjunto deseado de permisos para un rol: pares (vista_id, accion_id)."""
    permisos: list[tuple[int, int]]


def _accion_sort_key(codigo: str) -> tuple[int, str]:
    return (_ACCION_ORDEN.index(codigo) if codigo in _ACCION_ORDEN else len(_ACCION_ORDEN), codigo)


@router.get("/matriz")
async def get_matriz(
    current_user: CurrentUser = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Estructura completa para pintar la matriz de permisos."""
    # Acciones que realmente aplican a alguna vista (universo de columnas).
    acc_rows = (
        await session.execute(
            text(
                """
                select distinct a.id, a.codigo, a.nombre
                from acciones a
                join vista_acciones va on va.accion_id = a.id
                """
            )
        )
    ).mappings().all()
    acciones = sorted(
        ({"id": r["id"], "codigo": r["codigo"], "nombre": r["nombre"]} for r in acc_rows),
        key=lambda a: _accion_sort_key(a["codigo"]),
    )

    # Vistas + acciones aplicables a cada una.
    vista_rows = (
        await session.execute(
            text(
                """
                select v.id, v.codigo, v.nombre, v.modulo, v.is_active,
                       coalesce(array_agg(va.accion_id) filter (where va.accion_id is not null), '{}') as aplicables
                from vistas v
                left join vista_acciones va on va.vista_id = v.id
                group by v.id
                order by v.id
                """
            )
        )
    ).mappings().all()
    vistas = [
        {
            "id": r["id"],
            "codigo": r["codigo"],
            "nombre": r["nombre"],
            "modulo": r["modulo"],
            "is_active": r["is_active"],
            "aplicables": list(r["aplicables"]),
        }
        for r in vista_rows
    ]

    # Total de permisos asignables = nº de pares vista_acciones.
    total_asignable = (
        await session.execute(text("select count(*) from vista_acciones"))
    ).scalar_one()

    # Roles + sus permisos actuales.
    rol_rows = (
        await session.execute(text("select id, codigo, descripcion from roles order by id"))
    ).mappings().all()
    perm_rows = (
        await session.execute(text("select rol_id, vista_id, accion_id from rol_permisos"))
    ).mappings().all()
    perms_por_rol: dict[int, list[list[int]]] = {}
    for p in perm_rows:
        perms_por_rol.setdefault(p["rol_id"], []).append([p["vista_id"], p["accion_id"]])

    roles = [
        {
            "id": r["id"],
            "codigo": r["codigo"],
            "nombre": _ROL_NOMBRE.get(r["codigo"], r["descripcion"]),
            "descripcion": r["descripcion"],
            "permisos": perms_por_rol.get(r["id"], []),
            "total": len(perms_por_rol.get(r["id"], [])),
        }
        for r in rol_rows
    ]

    return {
        "acciones": acciones,
        "vistas": vistas,
        "roles": roles,
        "total_asignable": total_asignable,
    }


@router.get("/me")
async def get_mis_permisos(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Permisos efectivos del usuario actual para filtrar navegacion y rutas."""
    rows = (
        await session.execute(
            text(
                """
                select v.codigo as vista_codigo, v.nombre as vista_nombre,
                       v.modulo, a.codigo as accion_codigo
                from rol_permisos rp
                join roles r on r.id = rp.rol_id
                join vistas v on v.id = rp.vista_id
                join acciones a on a.id = rp.accion_id
                where r.codigo = :rol
                  and v.is_active = true
                order by v.id, a.id
                """
            ),
            {"rol": current_user.rol},
        )
    ).mappings().all()
    vistas: dict[str, dict] = {}
    for row in rows:
        item = vistas.setdefault(
            row["vista_codigo"],
            {
                "codigo": row["vista_codigo"],
                "nombre": row["vista_nombre"],
                "modulo": row["modulo"],
                "acciones": [],
            },
        )
        item["acciones"].append(row["accion_codigo"])
    return {
        "rol": current_user.rol,
        "vistas": list(vistas.values()),
        "permisos": {codigo: item["acciones"] for codigo, item in vistas.items()},
    }


@router.put("/roles/{rol_id}/permisos", status_code=status.HTTP_200_OK)
async def set_permisos(
    rol_id: int,
    payload: PermisosPayload,
    current_user: CurrentUser = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Reemplaza el conjunto completo de permisos de un rol.

    Solo se insertan los pares (vista_id, accion_id) que existan en
    vista_acciones (es decir, declarados aplicables a esa vista).
    """
    rol = (
        await session.execute(text("select codigo from roles where id = :id"), {"id": rol_id})
    ).scalar_one_or_none()
    if rol is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rol no encontrado")

    # Filtra al universo válido (vista_acciones) para no violar la FK compuesta.
    validos = {
        (r["vista_id"], r["accion_id"])
        for r in (
            await session.execute(text("select vista_id, accion_id from vista_acciones"))
        ).mappings().all()
    }
    deseados = {(int(v), int(a)) for v, a in payload.permisos if (int(v), int(a)) in validos}

    await session.execute(text("delete from rol_permisos where rol_id = :id"), {"id": rol_id})
    for vista_id, accion_id in deseados:
        await session.execute(
            text(
                "insert into rol_permisos (rol_id, vista_id, accion_id) "
                "values (:r, :v, :a) on conflict do nothing"
            ),
            {"r": rol_id, "v": vista_id, "a": accion_id},
        )
    await session.commit()
    return {"rol_id": rol_id, "total": len(deseados)}
