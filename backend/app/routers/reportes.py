from io import BytesIO

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user
from app.routers.biohuertos import _ensure_biohuerto_access
from app.schemas.users import CurrentUser
from app.services.dashboard_service import build_dashboard
from app.services.pdf_service import build_biohuerto_report_pdf

router = APIRouter(prefix="/api/reportes", tags=["reportes"])


@router.get("/{biohuerto_id}/pdf")
async def download_biohuerto_pdf(
    biohuerto_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    await _ensure_biohuerto_access(session, biohuerto_id, current_user)
    dashboard = await build_dashboard(session, biohuerto_id)

    biohuerto_result = await session.execute(
        text(
            """
            select id::text as id, nombre, codigo, area_m2, descripcion, created_at, updated_at
            from biohuertos
            where id = :biohuerto_id
              and deleted_at is null
            """
        ),
        {"biohuerto_id": biohuerto_id},
    )
    biohuerto = dict(biohuerto_result.mappings().one())

    cultivos_result = await session.execute(
        text(
            """
            select e.nombre as especie, ef.nombre as etapa,
                   c.fecha_siembra, c.fecha_estimada_cosecha
            from cultivos c
            join especies e on e.id = c.especie_id
            join etapas_fenologicas ef on ef.id = c.etapa_id
            where c.biohuerto_id = :biohuerto_id
              and c.deleted_at is null
            order by c.created_at desc
            limit 12
            """
        ),
        {"biohuerto_id": biohuerto_id},
    )
    cultivos = [dict(row) for row in cultivos_result.mappings().all()]

    costos_result = await session.execute(
        text(
            """
            select cc.nombre as categoria, cp.descripcion, cp.monto, cp.moneda, cp.fecha
            from costos_produccion cp
            join cultivos c on c.id = cp.cultivo_id
            join categorias_costo cc on cc.id = cp.categoria_id
            where c.biohuerto_id = :biohuerto_id
              and cp.deleted_at is null
              and c.deleted_at is null
            order by cp.fecha desc, cp.created_at desc
            limit 12
            """
        ),
        {"biohuerto_id": biohuerto_id},
    )
    costos = [dict(row) for row in costos_result.mappings().all()]

    pdf = build_biohuerto_report_pdf(
        biohuerto=biohuerto,
        dashboard=dashboard,
        cultivos=cultivos,
        costos=costos,
    )
    filename = f"reporte_biohuerto_{biohuerto_id}.pdf"
    return StreamingResponse(
        BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

