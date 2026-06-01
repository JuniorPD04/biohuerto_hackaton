# Guia de defensa - Biohuerto Inteligente

## Mensaje central

Biohuerto Inteligente es un PMV funcional para productores comunitarios de Lambayeque. Organiza biohuertos, cultivos, monitoreo, alertas, diagnostico fitosanitario, recomendaciones agroecologicas, cosechas, trazabilidad, costos, dashboard, reporte PDF y captura offline basica.

## Ruta sugerida de demo

1. Abrir `http://localhost:5173`.
2. Ingresar con `productor.demo@biohuerto.pe` y `Demo123!`.
3. Mostrar Dashboard:
   - cultivos activos;
   - proximas cosechas;
   - alertas;
   - costos;
   - semaforo ambiental;
   - CO2eq ahorrado.
4. Ir a Biohuertos y Cultivos para explicar trazabilidad por ficha y campania.
5. Registrar monitoreo manual con humedad, temperatura, luz e incidencia.
6. Ir a Diagnostico:
   - usar formulario guiado;
   - explicar que imagen es opcional y configurable;
   - mostrar recomendacion agroecologica sin agroquimicos sinteticos.
7. Ir a Mercado y mostrar cosechas publicadas para consumidores.
8. Ir a Trazabilidad y registrar practica sostenible o costo.
9. Ir a Reporte y descargar PDF.
10. Probar offline:
    - DevTools > Network > Offline;
    - registrar monitoreo con incidencia;
    - mostrar badge de pendientes;
    - volver online y sincronizar.

## Alineacion con rubrica

| Criterio | Evidencia en la demo |
| --- | --- |
| Alineacion con el problema | Biohuertos urbanos USAT, productores comunitarios, Lambayeque, comercializacion basica. |
| Cumplimiento funcional PMV | Usuarios, biohuertos, cultivos, monitoreo, alertas, diagnostico, recomendaciones, cosechas, trazabilidad, costos, dashboard y PDF. |
| Calidad tecnica | FastAPI, PostgreSQL, React, Docker Compose, tests, SQL parametrizado, roles de DB separados. |
| Usabilidad | UI mobile-first, formularios cortos, navegacion inferior movil, dashboard operativo. |
| Innovacion | IA configurable, recomendaciones agroecologicas, offline basico, huella de carbono. |
| Sostenibilidad e impacto | Semaforo ambiental, practicas sostenibles, costeo, CO2eq, trazabilidad. |
| Presentacion | Flujo de demo guiado, datos semilla, reporte PDF y checklist de defensa. |

## Seguridad a mencionar

- Access token en memoria de React.
- Refresh token en cookie `HttpOnly`, `Secure`, `SameSite=Lax`.
- Endpoints publicos correctos sin JWT: `/auth/register`, `/auth/login`, `/auth/refresh`, `/health`, catalogo publico de cosechas.
- RBAC para productor, consumidor y admin.
- Rate limiting en backend.
- CORS con origen explicito.
- Campos sensibles preparados para cifrado con Fernet.
- `migration_user` para init/migraciones y `app_bio_user` con privilegios minimos.
- No se hardcodean modelos OpenAI; se usan `OPENAI_MODEL_TEXT` y `OPENAI_MODEL_VISION`.

## Preguntas probables del jurado

**Que pasa si no hay internet?**  
El PMV guarda monitoreo e incidencias en IndexedDB y los sincroniza con `/api/sync` cuando vuelve la conexion. El alcance offline completo queda fuera para no comprometer estabilidad.

**La IA es obligatoria para que funcione?**  
No. El diagnostico guiado tiene fallback local estable. Si se configura OpenAI, usa la Responses API con modelos definidos por variables de entorno.

**Como protegen datos sensibles?**  
La arquitectura separa campos cifrados y usa Fernet desde variables de entorno. La demo evita exponer telefono/direccion completos en URLs o logs.

**Como conectan productores con consumidores?**  
El modulo Mercado publica cosechas con cantidad, precio referencial, fecha y contacto. No incluye pasarela de pago porque las bases no la exigen.

**Que evidencia hay de trazabilidad?**  
Cada cultivo tiene monitoreo, practicas sostenibles, costos, alertas, diagnosticos y cosechas asociables por UUID/FK.

## Checklist antes de presentar

- [ ] `.env` creado desde `.env.example`.
- [ ] `FERNET_KEY` configurado.
- [ ] `docker compose up --build` inicia sin errores.
- [ ] `http://localhost:8000/health` responde `ok`.
- [ ] `http://localhost:5173` carga.
- [ ] Login demo funciona.
- [ ] Dashboard muestra datos.
- [ ] Mercado muestra imagenes.
- [ ] Diagnostico guiado responde.
- [ ] PDF descarga.
- [ ] Offline crea pendientes y sincroniza.
- [ ] Tests backend pasan.
- [ ] Frontend compila.
