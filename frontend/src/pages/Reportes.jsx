import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PageHeader, Select } from "../components/ui/primitives.jsx";
import DataTable from "../components/ui/DataTable.jsx";
import { produccionApi, reportesApi } from "../lib/resources.js";

const asList = (d) => (Array.isArray(d) ? d : d?.items || []);
const nf = (v) => Number(v || 0).toLocaleString("es-PE", { maximumFractionDigits: 2 });
const money = (v) => `S/ ${nf(v)}`;
const fmtFecha = (v) => (v ? new Date(v).toLocaleDateString("es-PE") : "—");

// Metadatos de cada reporte (título/subtítulo por ruta).
const REPORTES = {
  produccion: { label: "Producción", subtitle: "Registro de producción consolidado por hortaliza." },
  comunidad: { label: "Comunidad", subtitle: "Producción e ingresos por comunidad, con desglose comunitario e individual." },
  inversion: { label: "Inversión x biohuerto", subtitle: "Horas dedicadas, personas participantes e inversión por biohuerto." },
};

/* ---------------- 2) Producción por hortaliza ---------------- */
function ProduccionTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    produccionApi.porHortaliza({}).then((d) => setRows(asList(d))).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="rounded-[18px] border border-line bg-white p-8 text-center text-muted-2">Cargando…</div>;
  if (rows.length === 0)
    return <div className="rounded-[18px] border border-line bg-white p-10 text-center text-muted-2">Sin producción registrada.</div>;

  const th = "border border-line px-2 py-2 text-[11.5px] font-extrabold uppercase tracking-[.02em] text-muted-2 whitespace-nowrap";
  const grp = "border border-line px-2 py-[7px] text-[12px] font-extrabold uppercase tracking-[.04em] text-primary text-center bg-chip-2";
  const td = "border border-line px-2 py-[9px] text-[13px] text-text whitespace-nowrap";
  const num = (v) => nf(v);

  return (
    <div className="overflow-x-auto rounded-[18px] border border-line bg-white">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            <th className={th} rowSpan={2}>N°</th>
            <th className={`${th} text-left`} rowSpan={2}>Hortaliza</th>
            <th className={grp} colSpan={5}>Calendario</th>
            <th className={grp} colSpan={7}>Producción</th>
            <th className={grp} colSpan={3}>Rentabilidad económica</th>
          </tr>
          <tr>
            <th className={th}>Área (m²)</th>
            <th className={th}>Prep. terreno</th>
            <th className={th}>Aplic. compost</th>
            <th className={th}>Época siembra</th>
            <th className={th}>Época cosecha</th>
            <th className={th}>RRSSOO (kg)</th>
            <th className={th}>Compost (kg)</th>
            <th className={th}>Otros insumos</th>
            <th className={th}>Total prod.</th>
            <th className={th}>Unidad</th>
            <th className={th}>Autoconsumo</th>
            <th className={th}>Venta (cant.)</th>
            <th className={th}>Inversión (S/.)</th>
            <th className={th}>Venta (S/.)</th>
            <th className={th}>Utilidad</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.hortaliza} className="hover:bg-chip">
              <td className={`${td} text-center text-muted-2`}>{i + 1}</td>
              <td className={`${td} font-extrabold`}>{r.hortaliza}</td>
              <td className={td}>{num(r.area_m2)}</td>
              <td className={td}>{fmtFecha(r.fecha_preparacion)}</td>
              <td className={td}>{fmtFecha(r.fecha_compost)}</td>
              <td className={td}>{fmtFecha(r.fecha_siembra)}</td>
              <td className={td}>{fmtFecha(r.fecha_cosecha)}</td>
              <td className={td}>{num(r.rrssoo_kg)}</td>
              <td className={td}>{num(r.compost_kg)}</td>
              <td className={`${td} max-w-[160px] truncate`} title={r.otros_insumos || ""}>{r.otros_insumos || "—"}</td>
              <td className={td}>{num(r.produccion_total)}</td>
              <td className={td}>{r.produccion_unidad || "—"}</td>
              <td className={td}>{num(r.autoconsumo_total)}</td>
              <td className={td}>{num(r.venta_cantidad)}</td>
              <td className={`${td} text-right`}>{money(r.inversion_insumos)}</td>
              <td className={`${td} text-right`}>{money(r.venta_soles)}</td>
              <td className={`${td} text-right font-extrabold text-primary`}>{money(r.utilidad)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- 3) Reporte por comunidad ---------------- */
function ComunidadTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    produccionApi.porComunidad().then((d) => setRows(asList(d))).finally(() => setLoading(false));
  }, []);
  const columns = [
    { key: "comunidad", label: "Comunidad", width: "1.3fr", render: (r) => <span className="font-extrabold text-text">{r.comunidad}</span> },
    { key: "biohuertos", label: "BH (com/cas)", width: ".9fr", render: (r) => `${r.biohuertos_comunitarios} / ${r.biohuertos_caseros}` },
    { key: "hogares", label: "Hogares", width: ".6fr" },
    { key: "siembras", label: "Siembras", width: ".7fr" },
    { key: "cosechas", label: "Cosechas", width: ".7fr" },
    { key: "rrssoo_kg", label: "RRSSOO", width: ".7fr", render: (r) => nf(r.rrssoo_kg) },
    { key: "compost_kg", label: "Compost", width: ".7fr", render: (r) => nf(r.compost_kg) },
    { key: "produccion_total", label: "Producción", width: ".8fr", render: (r) => nf(r.produccion_total) },
    { key: "autoconsumo_total", label: "Consumo", width: ".7fr", render: (r) => nf(r.autoconsumo_total) },
    { key: "inversion", label: "Inversión", width: ".8fr", render: (r) => money(r.inversion) },
    { key: "ingresos", label: "Ingresos", width: ".8fr", align: "right", render: (r) => <span className="font-extrabold text-primary">{money(r.ingresos)}</span> },
  ];
  return <DataTable columns={columns} rows={rows} loading={loading} empty={{ icon: "users", title: "Sin datos por comunidad" }} />;
}

/* ---------------- Inversión por biohuerto ---------------- */
function InversionTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState("");
  const [detalle, setDetalle] = useState(null);
  const [loadingDet, setLoadingDet] = useState(false);

  useEffect(() => {
    reportesApi.inversionBiohuerto().then((d) => setRows(asList(d))).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!sel) {
      setDetalle(null);
      return;
    }
    setLoadingDet(true);
    reportesApi
      .inversionBiohuertoDetalle(sel)
      .then(setDetalle)
      .catch(() => setDetalle(null))
      .finally(() => setLoadingDet(false));
  }, [sel]);

  const columns = [
    { key: "biohuerto", label: "Biohuerto", width: "1.4fr", render: (r) => <span className="font-extrabold text-text">{r.biohuerto}</span> },
    { key: "modalidad", label: "Modalidad", width: ".9fr" },
    { key: "area_m2", label: "Área (m²)", width: ".8fr", render: (r) => nf(r.area_m2) },
    { key: "total_horas", label: "Horas dedicadas", width: "1fr", render: (r) => nf(r.total_horas) },
    { key: "personas", label: "Personas", width: ".7fr" },
    { key: "inversion", label: "Inversión", width: "1fr", align: "right", render: (r) => <span className="font-extrabold text-primary">{money(r.inversion)}</span> },
  ];

  const filtro = (
    <div className="mb-5 max-w-[440px]">
      <div className="mb-[6px] text-[13.5px] font-bold text-text">Biohuerto</div>
      <Select value={sel} onChange={(e) => setSel(e.target.value)}>
        <option value="">Todos (resumen)</option>
        {rows.map((r) => (
          <option key={r.biohuerto_id} value={r.biohuerto_id}>{r.biohuerto}</option>
        ))}
      </Select>
    </div>
  );

  if (!sel) {
    return (
      <div>
        {filtro}
        <DataTable columns={columns} rows={rows} loading={loading} empty={{ icon: "coins", title: "Sin inversión registrada" }} />
      </div>
    );
  }

  const td = "border border-line px-3 py-[10px] text-[13.5px] text-text";
  const thc = "border border-line px-3 py-[10px] text-[12px] font-extrabold uppercase tracking-[.03em] text-muted-2";
  const val = (v) => (v == null ? "—" : nf(v));

  return (
    <div>
      {filtro}
      {loadingDet ? (
        <div className="rounded-[18px] border border-line bg-white p-8 text-center text-muted-2">Cargando…</div>
      ) : detalle ? (
        <div className="overflow-hidden rounded-[18px] border border-line bg-white">
          <div className="border-b border-line px-5 py-4">
            <div className="text-[18px] font-extrabold text-text">{detalle.biohuerto}</div>
            <div className="text-[13px] text-muted-2">{detalle.modalidad} · {nf(detalle.area_m2)} m²</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${thc} text-left`}>Ítem</th>
                  <th className={thc}>Unidad</th>
                  <th className={thc}>Cantidad</th>
                  <th className={thc}>Costo unit.</th>
                  <th className={thc}>Costo total</th>
                </tr>
              </thead>
              <tbody>
                {detalle.items.map((it) => (
                  <tr key={it.item} className="hover:bg-chip">
                    <td className={`${td} font-bold`}>{it.item}</td>
                    <td className={td}>{it.unidad || "—"}</td>
                    <td className={td}>{val(it.cantidad)}</td>
                    <td className={td}>{it.costo_unit == null ? "—" : money(it.costo_unit)}</td>
                    <td className={`${td} text-right`}>{it.costo_total == null ? "—" : money(it.costo_total)}</td>
                  </tr>
                ))}
                <tr className="bg-chip-2">
                  <td className={`${td} font-extrabold`} colSpan={4}>Inversión total</td>
                  <td className={`${td} text-right font-extrabold text-primary`}>{money(detalle.total_inversion)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function Reportes() {
  const { tab } = useParams();
  const key = REPORTES[tab] ? tab : "produccion";
  const meta = REPORTES[key];
  return (
    <div>
      <PageHeader title={`Reportes · ${meta.label}`} subtitle={meta.subtitle} />
      {key === "produccion" && <ProduccionTab />}
      {key === "comunidad" && <ComunidadTab />}
      {key === "inversion" && <InversionTab />}
    </div>
  );
}
