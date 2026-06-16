#!/usr/bin/env python3
"""Transforma seed2.sql (esquema VIEJO normalizado) -> seed nuevo.

Recupera los datos reales + fotos al esquema rediseñado:
- biohuertos.id int -> UUID (remapea cultivos/alertas/archivos_adjuntos.biohuerto_id)
- biohuertos.responsable_id -> biohuerto_propietarios
- cultivos.especie(txt)->especie_id ; unidad_cantidad(txt)->unidad_id
- incidencias.zona_afectada(txt)->zona_id
- practicas_agricolas.id int->UUID ; insumo(txt)->insumo_id ; unidad(txt)->unidad_id
- costos_produccion.id int->UUID ; unidad(txt)->unidad_id
- cosechas.unidad(txt)->unidad_id
Los catálogos faltantes se crean (es_sistema=false).
"""
import re
import sys
import unicodedata
import uuid

SRC = "backend/seed2.sql"
OUT = "backend/seed.sql"

# Catálogos del sistema (codigo, nombre) ya sembrados por init.sql
ESPECIES = {"lechuga": "Lechuga", "tomate": "Tomate", "fresa": "Fresa", "culantro": "Culantro",
            "espinaca": "Espinaca", "rabanito": "Rabanito", "zanahoria": "Zanahoria",
            "cebolla_china": "Cebolla china", "aji": "Ají", "otro": "Otro"}
UNIDADES = {"und": "Unidad", "kg": "Kilogramo", "g": "Gramo", "l": "Litro", "ml": "Mililitro",
            "atado": "Atado", "manojo": "Manojo", "m2": "Metro cuadrado", "planta": "Planta",
            "docena": "Docena", "saco": "Saco"}
INSUMOS = {"compost": "Compost", "humus": "Humus de lombriz", "biol": "Biol", "ceniza": "Ceniza",
           "jabon_potasico": "Jabón potásico", "caldo_bordeles": "Caldo bordelés",
           "cal_agricola": "Cal agrícola", "estiercol": "Estiércol", "abono_verde": "Abono verde",
           "agua": "Agua"}
ZONAS = {"hoja": "Hoja", "tallo": "Tallo", "raiz": "Raíz", "fruto": "Fruto", "flor": "Flor",
         "planta_completa": "Planta completa", "otro": "Otro"}


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower().strip()
    return re.sub(r"[^a-z0-9]+", "", s)


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower().strip()
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")[:40] or "item"


def build_matcher(catalog):
    """Devuelve dict normkey -> codigo, indexando codigo y nombre."""
    idx = {}
    for cod, nom in catalog.items():
        idx[norm(cod)] = cod
        idx[norm(nom)] = cod
    return idx


ESP_IDX, UNI_IDX, INS_IDX, ZON_IDX = (build_matcher(c) for c in (ESPECIES, UNIDADES, INSUMOS, ZONAS))
# Catálogos nuevos a crear: catalog_name -> {codigo: nombre}
NEW = {"especies": {}, "unidades": {}, "insumos": {}, "zonas_planta": {}}


def map_cat(value, idx, new_key, catalog):
    """value (texto viejo) -> codigo del catálogo; crea uno nuevo si no existe."""
    if value is None or value == "NULL":
        return None
    raw = unquote(value)
    if raw is None or raw.strip() == "":
        return None
    k = norm(raw)
    if k in idx:
        return idx[k]
    cod = slug(raw)
    # registra creación y al matcher para reusar
    NEW[new_key].setdefault(cod, raw)
    idx[k] = cod
    return cod


def unquote(v):
    if v is None or v == "NULL":
        return None
    if v.startswith("'") and v.endswith("'"):
        return v[1:-1].replace("''", "'")
    return v


def sqlstr(s):
    if s is None:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


# ---- tokenizer de la tupla VALUES (respeta comillas y \x bytea) ----
def split_values(s):
    out, buf, q, i = [], [], False, 0
    while i < len(s):
        c = s[i]
        if q:
            if c == "'":
                if i + 1 < len(s) and s[i + 1] == "'":
                    buf.append("''"); i += 2; continue
                q = False; buf.append(c)
            else:
                buf.append(c)
        else:
            if c == "'":
                q = True; buf.append(c)
            elif c == ",":
                out.append("".join(buf).strip()); buf = []
            else:
                buf.append(c)
        i += 1
    out.append("".join(buf).strip())
    return out


INSERT_RE = re.compile(r"^INSERT INTO public\.(\w+) \((.*?)\) VALUES \((.*)\);\s*$")


def parse(src):
    rows = {}
    with open(src, encoding="utf-8") as f:
        for line in f:
            m = INSERT_RE.match(line)
            if not m:
                continue
            t, cols, vals = m.group(1), m.group(2), m.group(3)
            cols = [c.strip() for c in cols.split(",")]
            vals = split_values(vals)
            if len(cols) != len(vals):
                sys.stderr.write(f"WARN {t}: {len(cols)} cols vs {len(vals)} vals\n")
                continue
            rows.setdefault(t, []).append(dict(zip(cols, vals)))
    return rows


def main():
    rows = parse(SRC)
    bh_map = {old["id"]: str(uuid.uuid4()) for old in rows.get("biohuertos", [])}

    out = []
    w = out.append
    w("-- ============================================================")
    w("--  SEED RECUPERADO desde seed2.sql -> esquema nuevo (datos reales + fotos)")
    w("--  Generado por backend/_recover_seed2.py")
    w("-- ============================================================\n")

    def insert(table, cols, rows_vals):
        if not rows_vals:
            return
        w(f"INSERT INTO {table} ({', '.join(cols)}) VALUES")
        w(",\n".join("  (" + ", ".join(r) + ")" for r in rows_vals) + ";\n")

    # 1) usuarios (directo)
    UC = ["id", "rol_id", "codigo", "nombre", "email", "password_hash",
          "telefono_encrypted", "direccion_encrypted", "is_active", "created_at", "updated_at", "deleted_at"]
    insert("usuarios", UC, [[r[c] for c in UC] for r in rows.get("usuarios", [])])
    w("SELECT setval('usuarios_id_seq', (SELECT COALESCE(MAX(id),1) FROM usuarios));\n")

    # 2) biohuertos (int->uuid, +tipo_area_id, +estado)
    bh_cols = ["id", "tipo_area_id", "codigo", "nombre", "descripcion",
               "ubicacion_referencia_encrypted", "area_m2", "estado", "is_active",
               "created_at", "updated_at", "deleted_at"]
    bh_vals, prop_vals = [], []
    for r in rows.get("biohuertos", []):
        uid = bh_map[r["id"]]
        estado = "'activo'" if r["is_active"] == "true" else "'inactivo'"
        bh_vals.append([f"'{uid}'", "(select id from tipos_area where codigo='biohuerto')",
                        r["codigo"], r["nombre"], r["descripcion"],
                        r["ubicacion_referencia_encrypted"], r["area_m2"], estado, r["is_active"],
                        r["created_at"], r["updated_at"], r["deleted_at"]])
        if r.get("responsable_id") and r["responsable_id"] != "NULL":
            prop_vals.append([f"'{uid}'", r["responsable_id"], "'propietario'"])
    insert("biohuertos", bh_cols, bh_vals)
    insert("biohuerto_propietarios", ["biohuerto_id", "propietario_id", "rol"], prop_vals)

    # 3) campanias (directo)
    CC = ["id", "nombre", "fecha_inicio", "fecha_fin", "activa", "created_at", "updated_at", "deleted_at"]
    insert("campanias", CC, [[r[c] for c in CC] for r in rows.get("campanias", [])])
    w("SELECT setval('campanias_id_seq', (SELECT COALESCE(MAX(id),1) FROM campanias));\n")

    # 4) consumidores_detalle (directo)
    CD = ["usuario_id", "tipo_consumidor", "created_at", "updated_at"]
    insert("consumidores_detalle", CD, [[r[c] for c in CD] for r in rows.get("consumidores_detalle", [])])

    # marcador de posición: catálogos nuevos se insertan AQUÍ tras recolectarlos
    cat_marker = len(out)

    # 5) cultivos (biohuerto int->uuid, especie/unidad txt->id)
    cu_cols = ["id", "biohuerto_id", "usuario_id", "campania_id", "etapa_id", "especie_id",
               "variedad", "fecha_siembra", "fecha_estimada_cosecha", "cantidad", "unidad_id",
               "area_m2", "notas", "is_active", "created_at", "updated_at", "deleted_at"]
    cu_vals = []
    for r in rows.get("cultivos", []):
        esp = map_cat(r["especie"], ESP_IDX, "especies", ESPECIES)
        uni = map_cat(r["unidad_cantidad"], UNI_IDX, "unidades", UNIDADES) or "und"
        cu_vals.append([r["id"], f"'{bh_map[r['biohuerto_id']]}'", r["usuario_id"], r["campania_id"],
                        r["etapa_id"], f"(select id from especies where codigo='{esp}')",
                        r["variedad"], r["fecha_siembra"], r["fecha_estimada_cosecha"], r["cantidad"],
                        f"(select id from unidades where codigo='{uni}')", r["area_m2"], r["notas"],
                        r["is_active"], r["created_at"], r["updated_at"], r["deleted_at"]])

    # 6) cultivos_historial_etapas (directo)
    CH = ["id", "cultivo_id", "etapa_id", "fecha", "titulo", "observacion", "created_at"]
    ch_vals = [[r[c] for c in CH] for r in rows.get("cultivos_historial_etapas", [])]

    # 7) monitoreo (directo)
    MC = ["id", "cultivo_id", "fuente", "usuario_id", "sensor_codigo", "registrado_en",
          "humedad_pct", "temperatura_c", "luminosidad_lux", "ph_suelo", "observacion",
          "nota_ajuste", "created_at", "updated_at", "deleted_at"]
    mo_vals = [[r[c] for c in MC] for r in rows.get("monitoreo_registros", [])]

    # 8) incidencias (zona_afectada txt->zona_id)
    ic_cols = ["id", "cultivo_id", "tipo_id", "usuario_id", "descripcion", "severidad",
               "zona_id", "estado", "reportado_en", "created_at", "updated_at", "deleted_at"]
    ic_vals = []
    for r in rows.get("incidencias", []):
        z = map_cat(r["zona_afectada"], ZON_IDX, "zonas_planta", ZONAS)
        zexpr = f"(select id from zonas_planta where codigo='{z}')" if z else "NULL"
        ic_vals.append([r["id"], r["cultivo_id"], r["tipo_id"], r["usuario_id"], r["descripcion"],
                        r["severidad"], zexpr, r["estado"], r["reportado_en"],
                        r["created_at"], r["updated_at"], r["deleted_at"]])

    # 9) diagnosticos (directo)
    DG = ["id", "cultivo_id", "incidencia_id", "usuario_id", "parte_planta", "observaciones_previas",
          "modelo_usado", "enfermedad_detectada", "nombre_cientifico", "confianza_pct",
          "nivel_riesgo", "guardado", "created_at", "updated_at", "deleted_at"]
    dg_vals = [[r[c] for c in DG] for r in rows.get("diagnosticos", [])]
    DA = ["id", "diagnostico_id", "enfermedad", "confianza_pct", "orden"]
    da_vals = [[r[c] for c in DA] for r in rows.get("diagnostico_alternativas", [])]

    # 10) recomendaciones (directo)
    RC = ["id", "cultivo_id", "diagnostico_id", "titulo", "cuerpo", "prioridad", "categoria",
          "tipo_manejo", "fuente", "origen", "aplicada", "aplicada_en", "created_at", "updated_at", "deleted_at"]
    rc_vals = [[r[c] for c in RC] for r in rows.get("recomendaciones", [])]

    # 11) practicas (id int->uuid, insumo/unidad txt->id)
    pr_cols = ["cultivo_id", "usuario_id", "tipo_id", "descripcion", "insumo_id", "cantidad",
               "unidad_id", "fecha_aplicacion", "created_at", "updated_at", "deleted_at"]
    pr_vals = []
    for r in rows.get("practicas_agricolas", []):
        ins = map_cat(r["insumo"], INS_IDX, "insumos", INSUMOS)
        uni = map_cat(r["unidad"], UNI_IDX, "unidades", UNIDADES) or "und"
        insexpr = f"(select id from insumos where codigo='{ins}')" if ins else "NULL"
        pr_vals.append([r["cultivo_id"], r["usuario_id"], r["tipo_id"], r["descripcion"], insexpr,
                        r["cantidad"], f"(select id from unidades where codigo='{uni}')",
                        r["fecha_aplicacion"], r["created_at"], r["updated_at"], r["deleted_at"]])

    # 12) costos (id int->uuid, unidad txt->id)
    co_cols = ["cultivo_id", "usuario_id", "categoria_id", "descripcion", "cantidad", "unidad_id",
               "monto", "moneda", "fecha", "created_at", "updated_at", "deleted_at"]
    co_vals = []
    for r in rows.get("costos_produccion", []):
        uni = map_cat(r["unidad"], UNI_IDX, "unidades", UNIDADES) or "und"
        co_vals.append([r["cultivo_id"], r["usuario_id"], r["categoria_id"], r["descripcion"],
                        r["cantidad"], f"(select id from unidades where codigo='{uni}')",
                        r["monto"], r["moneda"], r["fecha"], r["created_at"], r["updated_at"], r["deleted_at"]])

    # 13) cosechas (unidad txt->id)
    cs_cols = ["id", "cultivo_id", "usuario_id", "nombre_producto", "cantidad", "unidad_id",
               "precio_referencial", "fecha_cosecha", "link_whatsapp", "telefono_encrypted",
               "estado", "published_at", "created_at", "updated_at", "deleted_at"]
    cs_vals = []
    for r in rows.get("cosechas", []):
        uni = map_cat(r["unidad"], UNI_IDX, "unidades", UNIDADES) or "kg"
        cs_vals.append([r["id"], r["cultivo_id"], r["usuario_id"], r["nombre_producto"], r["cantidad"],
                        f"(select id from unidades where codigo='{uni}')", r["precio_referencial"],
                        r["fecha_cosecha"], r["link_whatsapp"], r["telefono_encrypted"], r["estado"],
                        r["published_at"], r["created_at"], r["updated_at"], r["deleted_at"]])

    # 14) cosechas_intereses (directo)
    CI = ["id", "cosecha_id", "consumidor_id", "mensaje", "created_at"]
    ci_vals = [[r[c] for c in CI] for r in rows.get("cosechas_intereses", [])]

    # 15) alertas (biohuerto int->uuid)
    al_cols = ["id", "cultivo_id", "biohuerto_id", "usuario_id", "tipo_id", "titulo", "descripcion",
               "prioridad", "estado", "fecha_programada", "es_automatica", "created_at", "updated_at",
               "deleted_at", "vista", "cuidado_id"]
    al_vals = []
    for r in rows.get("alertas", []):
        bid = f"'{bh_map[r['biohuerto_id']]}'" if r.get("biohuerto_id") and r["biohuerto_id"] != "NULL" else "NULL"
        al_vals.append([r["id"], r["cultivo_id"], bid, r["usuario_id"], r["tipo_id"], r["titulo"],
                        r["descripcion"], r["prioridad"], r["estado"], r["fecha_programada"],
                        r["es_automatica"], r["created_at"], r["updated_at"], r["deleted_at"],
                        r.get("vista", "false"), r.get("cuidado_id", "NULL")])

    # 16) huella_carbono (directo - todas las columnas del dump)
    hc_rows = rows.get("huella_carbono", [])
    hc_cols = list(hc_rows[0].keys()) if hc_rows else []
    hc_vals = [[r[c] for c in hc_cols] for r in hc_rows]

    # 17) archivos_adjuntos (biohuerto int->uuid) -- FOTOS
    aa_cols = ["id", "biohuerto_id", "cultivo_id", "incidencia_id", "diagnostico_id", "cosecha_id",
               "usuario_id", "nombre", "mime_type", "tamano_bytes", "datos", "es_principal", "created_at"]
    aa_vals = []
    for r in rows.get("archivos_adjuntos", []):
        bid = f"'{bh_map[r['biohuerto_id']]}'" if r.get("biohuerto_id") and r["biohuerto_id"] != "NULL" else "NULL"
        aa_vals.append([r["id"], bid, r["cultivo_id"], r["incidencia_id"], r["diagnostico_id"],
                        r["cosecha_id"], r["usuario_id"], r["nombre"], r["mime_type"],
                        r["tamano_bytes"], r["datos"], r["es_principal"], r["created_at"]])

    # --- insertar catálogos nuevos en el marcador (ya recolectados) ---
    cat_sql = []
    for tbl, items in NEW.items():
        if not items:
            continue
        vals = ",\n".join(f"  ('{cod}', {sqlstr(nom)}, FALSE)" for cod, nom in items.items())
        cat_sql.append(f"INSERT INTO {tbl} (codigo, nombre, es_sistema) VALUES\n{vals}\n"
                       f"ON CONFLICT (codigo) DO NOTHING;\n")
    out[cat_marker:cat_marker] = (["-- Catálogos nuevos (valores de texto que no estaban en el sistema)"] + cat_sql) if cat_sql else []

    # emitir el resto en orden de dependencias
    insert("cultivos", cu_cols, cu_vals)
    insert("cultivos_historial_etapas", CH, ch_vals)
    w("SELECT setval('cultivos_historial_etapas_id_seq', (SELECT COALESCE(MAX(id),1) FROM cultivos_historial_etapas));\n")
    insert("monitoreo_registros", MC, mo_vals)
    insert("incidencias", ic_cols, ic_vals)
    insert("diagnosticos", DG, dg_vals)
    insert("diagnostico_alternativas", DA, da_vals)
    w("SELECT setval('diagnostico_alternativas_id_seq', (SELECT COALESCE(MAX(id),1) FROM diagnostico_alternativas));\n")
    insert("recomendaciones", RC, rc_vals)
    w("SELECT setval('recomendaciones_id_seq', (SELECT COALESCE(MAX(id),1) FROM recomendaciones));\n")
    insert("practicas_agricolas", pr_cols, pr_vals)
    insert("costos_produccion", co_cols, co_vals)
    insert("cosechas", cs_cols, cs_vals)
    insert("cosechas_intereses", CI, ci_vals)
    w("SELECT setval('cosechas_intereses_id_seq', (SELECT COALESCE(MAX(id),1) FROM cosechas_intereses));\n")
    insert("alertas", al_cols, al_vals)
    w("SELECT setval('alertas_id_seq', (SELECT COALESCE(MAX(id),1) FROM alertas));\n")
    if hc_cols:
        insert("huella_carbono", hc_cols, hc_vals)
        w("SELECT setval('huella_carbono_id_seq', (SELECT COALESCE(MAX(id),1) FROM huella_carbono));\n")
    insert("archivos_adjuntos", aa_cols, aa_vals)
    w("SELECT setval('archivos_adjuntos_id_seq', (SELECT COALESCE(MAX(id),1) FROM archivos_adjuntos));\n")

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(out))

    # reporte
    sys.stderr.write("=== RESUMEN RECUPERACIÓN ===\n")
    for t in ["usuarios", "biohuertos", "cultivos", "cosechas", "incidencias",
              "practicas_agricolas", "costos_produccion", "alertas", "archivos_adjuntos"]:
        sys.stderr.write(f"  {t}: {len(rows.get(t, []))}\n")
    for tbl, items in NEW.items():
        if items:
            sys.stderr.write(f"  catálogo nuevo {tbl}: {len(items)} -> {list(items.values())}\n")


if __name__ == "__main__":
    main()
