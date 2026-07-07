import { Link } from "react-router-dom";
import { Button, Card, Icon } from "../components/ui/primitives.jsx";
import logo from "../assets/logo_biohuerto.jpeg";

const CALENDARIO = [
  { mes: "Mayo", fecha: "Lunes 4" },
  { mes: "Junio", fecha: "Lunes 1" },
  { mes: "Julio", fecha: "Miércoles 1" },
  { mes: "Septiembre", fecha: "Martes 1" },
  { mes: "Octubre", fecha: "Jueves 1" },
  { mes: "Noviembre", fecha: "Lunes 2" },
];

const PILARES = [
  {
    icon: "leaf",
    titulo: "Productores agroecológicos",
    texto:
      "Familias y vecinos que cultivan hortalizas y hierbas en biohuertos urbanos, con acompañamiento técnico, diagnóstico fitosanitario por foto y registro de su producción.",
  },
  {
    icon: "store",
    titulo: "Minimarket Ecológico",
    texto:
      "Un espacio de venta directa en el Campus USAT, una vez al mes, donde la comunidad universitaria compra productos frescos y agroecológicos a quienes los cultivan.",
  },
  {
    icon: "shieldCheck",
    titulo: "Seguimiento sostenible",
    texto:
      "La Coordinación Social acompaña a cada productor con reportes de sostenibilidad y huella de carbono, promoviendo prácticas 100% orgánicas, sin agroquímicos.",
  },
];

function GaleriaPlaceholder({ label }) {
  return (
    <div className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-2 bg-chip text-muted-2">
      <Icon name="camera" size={22} />
      <span className="px-3 text-center text-[12px] font-semibold leading-snug">{label}</span>
    </div>
  );
}

export default function Proyecto() {
  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] items-center gap-3 px-4 py-3 sm:px-6">
          <img src={logo} alt="Biohuertos Urbanos CISUSAT" className="h-10 w-10 rounded-xl object-cover" />
          <div className="hidden sm:block">
            <div className="text-[15px] font-extrabold leading-none text-text">Biohuertos Urbanos CISUSAT</div>
            <div className="mt-1 text-[12.5px] font-semibold text-muted-2">Cultivando salud en casa</div>
          </div>
          <div className="flex-1" />
          <Link to="/tienda" className="text-sm font-bold text-muted-1 hover:text-primary">
            Ver el Minimarket
          </Link>
          <Link
            to="/login"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:brightness-95"
          >
            Iniciar sesión
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-line bg-gradient-to-b from-accent-50 to-bg">
        <div className="mx-auto max-w-[1100px] px-4 py-16 sm:px-6 sm:py-20">
          <p className="m-0 text-[13px] font-extrabold uppercase tracking-[.12em] text-primary">
            Programa institucional CISUSAT
          </p>
          <h1 className="m-0 mt-3 max-w-[18ch] text-[38px] font-extrabold leading-[1.08] tracking-[-.02em] text-text sm:text-[52px]">
            Biohuertos Urbanos CISUSAT
          </h1>
          <p className="mt-4 max-w-[58ch] text-[17px] leading-[1.6] text-muted-1">
            Un programa de la Dirección de Responsabilidad Social Universitaria de la USAT que impulsa la
            agricultura ecológica en casa: familias que cultivan sus propios biohuertos, y una comunidad
            universitaria que los acompaña y consume lo que producen.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/tienda">
              <Button icon="store">Ver productos del Minimarket</Button>
            </Link>
            <Link to="/login">
              <Button variant="secondary" icon="sprout">
                Soy productor, quiero ingresar
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Qué es CISUSAT */}
      <section className="mx-auto max-w-[1100px] px-4 py-14 sm:px-6">
        <h2 className="m-0 text-[26px] font-extrabold text-primary">¿Qué es CISUSAT?</h2>
        <p className="mt-3 max-w-[70ch] text-[15.5px] leading-[1.7] text-muted-1">
          CISUSAT — Ciudad Sustentable, Saludable, Ambiental y Territorial — es el programa con el que la
          Coordinación Social de la USAT acompaña a familias y vecinos de la región para que instalen y
          mantengan biohuertos urbanos: huertos pequeños en casas, patios o terrenos comunitarios, cultivados
          con prácticas 100% orgánicas. El objetivo es doble: mejorar la seguridad alimentaria y los ingresos
          de cada familia productora, y tejer un vínculo directo y duradero con quienes compran lo que
          cultivan.
        </p>

        <div className="mt-10 grid gap-[18px] sm:grid-cols-3">
          {PILARES.map((p) => (
            <Card key={p.titulo} pad="p-6">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-50 text-primary">
                <Icon name={p.icon} size={22} />
              </span>
              <h3 className="m-0 mt-4 text-[16.5px] font-extrabold text-text">{p.titulo}</h3>
              <p className="mt-2 text-[14px] leading-[1.6] text-muted-2">{p.texto}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Minimarket */}
      <section className="border-y border-line bg-chip-3">
        <div className="mx-auto max-w-[1100px] px-4 py-14 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_.9fr]">
            <div>
              <h2 className="m-0 text-[26px] font-extrabold text-primary">El Minimarket Ecológico</h2>
              <p className="mt-3 max-w-[60ch] text-[15.5px] leading-[1.7] text-muted-1">
                Una vez al mes, los productores de CISUSAT se reúnen en el Campus USAT para vender
                directamente sus cosechas a la comunidad universitaria. Es también un punto de encuentro:
                el lugar donde compradores y productores se conocen y pueden seguir en contacto más allá de
                un solo día de feria.
              </p>
              <p className="mt-3 max-w-[60ch] text-[15.5px] leading-[1.7] text-muted-1">
                Este catálogo virtual complementa la feria física: puedes revisar qué hay disponible y
                contactar directamente al productor por WhatsApp, sin necesidad de crear una cuenta.
              </p>
              <div className="mt-6">
                <Link to="/tienda">
                  <Button icon="store">Ver el catálogo ahora</Button>
                </Link>
              </div>
            </div>
            <Card pad="p-0" className="overflow-hidden self-start">
              <div className="border-b border-line bg-white px-6 py-4">
                <h3 className="m-0 text-[14px] font-extrabold uppercase tracking-[.05em] text-muted-2">
                  Calendario 2026 · Campus USAT
                </h3>
              </div>
              <div className="divide-y divide-line">
                {CALENDARIO.map((c) => (
                  <div key={c.mes} className="flex items-center justify-between px-6 py-3">
                    <span className="text-[14.5px] font-bold text-text">{c.mes}</span>
                    <span className="text-[14.5px] font-semibold text-muted-1">{c.fecha}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Galería */}
      <section className="mx-auto max-w-[1100px] px-4 py-14 sm:px-6">
        <h2 className="m-0 text-[26px] font-extrabold text-primary">Fotos y videos del proyecto</h2>
        <p className="mt-3 max-w-[65ch] text-[15px] text-muted-2">
          Este espacio está reservado para fotos y videos reales del Minimarket Ecológico y de los biohuertos
          de nuestros productores — pendiente de que el equipo de Coordinación Social los comparta.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <GaleriaPlaceholder label="Feria del Minimarket" />
          <GaleriaPlaceholder label="Biohuertos en casa" />
          <GaleriaPlaceholder label="Cosechas de la comunidad" />
          <GaleriaPlaceholder label="Video institucional" />
        </div>
      </section>

      <footer className="border-t border-line py-10 text-center">
        <p className="m-0 text-[13.5px] font-bold text-text">
          Dirección de Responsabilidad Social Universitaria — USAT
        </p>
        <p className="mt-1 text-[13px] text-muted-2">Coordinación Social · Programa Institucional CISUSAT</p>
      </footer>
    </div>
  );
}
