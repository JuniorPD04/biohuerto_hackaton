import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Card,
  PageHeader,
  Field,
  Input,
  Select,
  SearchInput,
  Avatar,
  EstadoBadge,
  IconBtn,
  Modal,
  Button,
  Toggle,
  EmptyState,
  Icon,
} from "../components/ui/primitives.jsx";
import { useToast } from "../components/ui/Toast.jsx";
import {
  useConfirm,
  useNotify,
  bajaDialog,
  reactivarDialog,
  eliminarDialog,
  referenciadoDialog,
} from "../components/ui/Confirm.jsx";
import { usuariosApi } from "../lib/resources.js";
import { tintFor, fmtFecha } from "../lib/theme.js";

const ROL_LABEL = { productor: "Productor", consumidor: "Consumidor", admin: "Administrador" };

const TABS = {
  consumidores: {
    title: "Gestión de consumidores",
    subtitle: "Administra la red de compradores y puntos de demanda.",
    head: "Consumidor",
    filter: (u) => u.rol === "consumidor",
  },
  productores: {
    title: "Gestión de productores",
    subtitle: "Visualiza y administra la red de productores locales.",
    head: "Productor",
    // Productores incluye administradores.
    filter: (u) => u.rol === "productor" || u.rol === "admin",
  },
};

export default function Usuarios() {
  const { tab } = useParams();
  const cfg = TABS[tab] || TABS.productores;
  const rolNuevo = tab === "consumidores" ? "consumidor" : "productor";
  const toast = useToast();
  const confirm = useConfirm();
  const notify = useNotify();

  const [q, setQ] = useState("");
  const [estadoF, setEstadoF] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(null);
  const [editing, setEditing] = useState(null);
  const [registrar, setRegistrar] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setUsers(await usuariosApi.list());
    } catch (err) {
      toast(err?.response?.data?.detail || "No se pudieron cargar los usuarios", "danger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dar de baja / reactivar usando el diálogo reutilizable.
  const toggleActivo = async (u) => {
    const ok = await confirm(u.is_active ? bajaDialog(u.nombre) : reactivarDialog(u.nombre));
    if (!ok) return;
    try {
      await usuariosApi.setActive(u.id, !u.is_active);
      toast(u.is_active ? "Usuario dado de baja" : "Usuario reactivado");
      load();
    } catch (err) {
      toast(err?.response?.data?.detail || "No se pudo actualizar el usuario", "danger");
    }
  };

  const eliminar = async (u) => {
    const ok = await confirm(eliminarDialog(u.nombre));
    if (!ok) return;
    try {
      await usuariosApi.remove(u.id);
      toast("Usuario eliminado");
      setView((v) => (v && v.id === u.id ? null : v));
      load();
    } catch (err) {
      if (err?.response?.status === 409) {
        notify(referenciadoDialog());
      } else {
        toast(err?.response?.data?.detail || "No se pudo eliminar el usuario", "danger");
      }
    }
  };

  // Reiniciar filtros al cambiar de pestaña.
  useEffect(() => { setQ(""); setEstadoF(""); }, [tab]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return users
      .filter(cfg.filter)
      .filter((u) =>
        (!term || `${u.nombre} ${u.email} #${u.id}`.toLowerCase().includes(term)) &&
        (!estadoF ||
          (estadoF === "Activo" && u.is_active) ||
          (estadoF === "Baja" && !u.is_active)))
      // Activos primero, conservando el orden original dentro de cada grupo.
      .sort((a, b) => Number(b.is_active ?? true) - Number(a.is_active ?? true));
  }, [users, cfg, q, estadoF]);

  return (
    <div className="animate-fade">
      <PageHeader
        title={cfg.title}
        subtitle={cfg.subtitle}
        action={
          <Button icon="userPlus" onClick={() => setRegistrar(true)}>
            Registrar
          </Button>
        }
      />

      <Card pad="p-5" style={{ marginBottom: 26, background: "var(--chip-2)", border: "1px solid var(--line)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, alignItems: "end" }}>
          <Field label="Búsqueda">
            <SearchInput placeholder="Nombre, correo o ID" value={q} onChange={(e) => setQ(e.target.value)} />
          </Field>
          <Field label="Filtrar por Estado">
            <Select value={estadoF} onChange={(e) => setEstadoF(e.target.value)}>
              <option value="">Todos los estados</option>
              <option>Activo</option>
              <option>Baja</option>
            </Select>
          </Field>
        </div>
      </Card>

      <Card pad="p-0" style={{ overflow: "hidden" }}>
        <Table head={[cfg.head, "Contacto", "Dirección", "Estado", "Registro", "Acciones"]} cols="1.5fr 1fr 1.2fr .7fr .8fr .9fr">
          {!loading && filtered.map((u) => {
            const dim = !u.is_active;
            return (
              <Row key={u.id} cols="1.5fr 1fr 1.2fr .7fr .8fr .9fr">
                <Cell>
                  <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
                    <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                      <div style={{ fontWeight: 800, fontSize: 15.5, whiteSpace: "nowrap", lineHeight: 1.2, color: dim ? "var(--muted-2)" : "var(--text)" }}>{u.nombre}</div>
                      <div style={{ fontSize: 12.5, color: "var(--muted-2)", fontWeight: 600 }}>{u.email}</div>
                    </div>
                  </div>
                </Cell>
                <Cell><span style={{ color: dim ? "var(--muted-3)" : "var(--muted-1)", fontSize: 14, fontFamily: "var(--mono)" }}>{u.telefono || "Sin teléfono"}</span></Cell>
                <Cell><span style={{ color: dim ? "var(--muted-3)" : "var(--muted-1)", fontSize: 14 }}>{u.direccion || "Sin dirección"}</span></Cell>
                <Cell><EstadoBadge activo={u.is_active} /></Cell>
                <Cell><span style={{ color: dim ? "var(--muted-3)" : "var(--muted-1)", fontSize: 14, fontFamily: "var(--mono)" }}>{fmtFecha(u.created_at)}</span></Cell>
                <Cell align="right">
                  <div style={{ display: "flex", gap: 8, marginLeft: "auto", alignItems: "center" }}>
                    <IconBtn name="eye" title="Ver detalle" onClick={() => setView(u)} />
                    <IconBtn name="edit" title={dim ? "Reactiva al usuario para editarlo" : "Editar"} tone="primary" disabled={dim} onClick={() => setEditing(u)} />
                    <Toggle on={u.is_active} title={u.is_active ? "Dar de baja" : "Reactivar"} onClick={() => toggleActivo(u)} />
                    <IconBtn name="trash" title="Eliminar" tone="danger" onClick={() => eliminar(u)} />
                  </div>
                </Cell>
              </Row>
            );
          })}
        </Table>

        {loading ? (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--muted-2)", fontWeight: 600 }}>Cargando usuarios…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "16px 24px 24px" }}>
            <EmptyState icon="users" title="Sin resultados" desc="No se encontraron usuarios que coincidan con los filtros aplicados." />
          </div>
        ) : (
          <div style={{ padding: "18px 26px", borderTop: "1px solid var(--line)", fontSize: 13.5, fontWeight: 700, color: "var(--muted-2)" }}>
            Mostrando {filtered.length} {filtered.length === 1 ? "usuario" : "usuarios"}
          </div>
        )}
      </Card>

      <UsuarioModal user={view} role={cfg.head} onClose={() => setView(null)} />
      <EditarUsuarioModal
        user={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
      <RegistrarUsuarioModal
        open={registrar}
        rol={rolNuevo}
        onClose={() => setRegistrar(false)}
        onCreated={() => {
          setRegistrar(false);
          load();
        }}
      />
    </div>
  );
}

function UsuarioModal({ user, role, onClose }) {
  if (!user) return null;
  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title={user.nombre}
      subtitle={`#${user.id} · ${ROL_LABEL[user.rol] || role}`}
      width={580}
    >
      <div style={{ display: "grid", gap: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 20px", background: "#fff", border: "1px solid var(--line)", borderRadius: 16 }}>
          <Avatar name={user.nombre} size={56} tint={user.rol === "admin" ? "tomate" : tintFor(user.nombre)} dim={!user.is_active} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: "var(--text)" }}>{user.nombre}</div>
            <div style={{ fontSize: 13.5, color: "var(--muted-2)", fontWeight: 600 }}>{ROL_LABEL[user.rol] || role}</div>
          </div>
          <EstadoBadge activo={user.is_active} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22, padding: 20, background: "#fff", border: "1px solid var(--line)", borderRadius: 16 }}>
          <DetailRow icon="info" label="ID de registro" value={"#" + user.id} mono />
          <DetailRow icon="users" label="Rol" value={ROL_LABEL[user.rol] || role} />
          <DetailRow icon="bell" label="Correo electrónico" value={user.email} />
          <DetailRow icon="activity" label="Teléfono" value={user.telefono} mono />
          <DetailRow icon="pin" label="Dirección" value={user.direccion} full />
          <DetailRow icon="calendar" label="Fecha de registro" value={fmtFecha(user.created_at)} mono />
          <DetailRow icon="clock" label="Última actualización" value={fmtFecha(user.updated_at)} mono />
        </div>
      </div>
    </Modal>
  );
}

function RegistrarUsuarioModal({ open, rol, onClose, onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState({ nombre: "", email: "", password: "", telefono: "", direccion: "" });
  const [saving, setSaving] = useState(false);
  const rolLabel = rol === "consumidor" ? "consumidor" : "productor";
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.nombre || !form.email || form.password.length < 8) {
      toast("Completa nombre, correo y contraseña (mín. 8 caracteres)", "danger");
      return;
    }
    setSaving(true);
    try {
      await usuariosApi.create({
        nombre: form.nombre,
        email: form.email,
        password: form.password,
        rol,
        telefono: form.telefono || null,
        direccion: form.direccion || null,
      });
      toast(`${rolLabel === "consumidor" ? "Consumidor" : "Productor"} registrado`);
      setForm({ nombre: "", email: "", password: "", telefono: "", direccion: "" });
      onCreated();
    } catch (err) {
      toast(err?.response?.data?.detail || "No se pudo registrar el usuario", "danger");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Registrar ${rolLabel}`}
      subtitle="Crea una nueva cuenta y sus datos de contacto."
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon="check" onClick={submit} disabled={saving}>
            {saving ? "Registrando…" : "Registrar"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Nombre completo">
          <Input value={form.nombre} onChange={set("nombre")} placeholder="Ej: Carlos Ruiz" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Correo electrónico">
            <Input type="email" value={form.email} onChange={set("email")} placeholder="correo@dominio.pe" />
          </Field>
          <Field label="Contraseña" hint="Mínimo 8 caracteres">
            <Input type="password" value={form.password} onChange={set("password")} placeholder="••••••••" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Teléfono (opcional)">
            <Input value={form.telefono} onChange={set("telefono")} placeholder="+51 987 654 321" />
          </Field>
          <Field label="Dirección (opcional)">
            <Input value={form.direccion} onChange={set("direccion")} placeholder="Av. Siempre Viva 123" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function EditarUsuarioModal({ user, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ nombre: "", telefono: "", direccion: "" });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    if (user) {
      setForm({ nombre: user.nombre || "", telefono: user.telefono || "", direccion: user.direccion || "" });
    }
  }, [user]);

  if (!user) return null;

  const submit = async () => {
    if (!form.nombre.trim()) {
      toast("El nombre es obligatorio", "danger");
      return;
    }
    setSaving(true);
    try {
      await usuariosApi.update(user.id, {
        nombre: form.nombre,
        telefono: form.telefono || null,
        direccion: form.direccion || null,
      });
      toast("Usuario actualizado");
      onSaved();
    } catch (err) {
      toast(err?.response?.data?.detail || "No se pudo actualizar el usuario", "danger");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title="Editar usuario"
      subtitle={`#${user.id} · ${user.email}`}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon="check" onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Nombre completo">
          <Input value={form.nombre} onChange={set("nombre")} placeholder="Nombre del usuario" />
        </Field>
        <Field label="Correo electrónico" hint="El correo no se puede modificar">
          <Input value={user.email} disabled className="!bg-chip !text-muted-2" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Teléfono">
            <Input value={form.telefono} onChange={set("telefono")} placeholder="+51 987 654 321" />
          </Field>
          <Field label="Dirección">
            <Input value={form.direccion} onChange={set("direccion")} placeholder="Av. Siempre Viva 123" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function DetailRow({ icon, label, value, mono, full }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, gridColumn: full ? "1 / -1" : "auto" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--muted-2)" }}>
        {icon && <Icon name={icon} size={15} />}{label}
      </span>
      <span style={{ fontSize: 15.5, fontWeight: 700, color: "var(--text)", fontFamily: mono ? "var(--mono)" : "inherit", wordBreak: "break-word" }}>{value || `Sin ${(label || "dato").toLowerCase()}`}</span>
    </div>
  );
}

// ---- Primitivas de tabla (portadas del prototipo) ----
function Table({ head, cols, children }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 16, padding: "16px 26px", background: "var(--chip-2)", borderBottom: "1px solid var(--line)" }}>
        {head.map((h, i) => (
          <div key={i} style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--muted-2)", textAlign: i === head.length - 1 ? "right" : "left" }}>{h}</div>
        ))}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Row({ cols, children }) {
  const [h, setH] = useState(false);
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{ display: "grid", gridTemplateColumns: cols, gap: 16, padding: "18px 26px", alignItems: "center", borderBottom: "1px solid var(--line)", background: h ? "var(--chip-3)" : "transparent", transition: "background .12s" }}
    >
      {children}
    </div>
  );
}

function Cell({ children, align }) {
  return <div style={{ display: "flex", justifyContent: align === "right" ? "flex-end" : "flex-start", minWidth: 0 }}>{children}</div>;
}
