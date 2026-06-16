import { api } from "./api.js";

const unwrap = (p) => p.then((r) => r.data);
// Acepta un cultivoId (string) o un objeto de params { cultivo_id, biohuerto_id, estado, ... }
const asParams = (arg) => (typeof arg === "string" ? { cultivo_id: arg } : arg || {});

export const biohuertosApi = {
  list: () => unwrap(api.get("/api/biohuertos")),
  get: (id) => unwrap(api.get(`/api/biohuertos/${id}`)),
  propietarios: (id) => unwrap(api.get(`/api/biohuertos/${id}/propietarios`)),
  assignPropietario: (id, body) => unwrap(api.post(`/api/biohuertos/${id}/propietarios`, body)),
  removePropietario: (id, propietarioId) => api.delete(`/api/biohuertos/${id}/propietarios/${propietarioId}`),
  create: (body) => unwrap(api.post("/api/biohuertos", body)),
  update: (id, body) => unwrap(api.patch(`/api/biohuertos/${id}`, body)),
  remove: (id) => api.delete(`/api/biohuertos/${id}`),
};

export const cultivosApi = {
  list: (params) => unwrap(api.get("/api/cultivos", { params })),
  get: (id) => unwrap(api.get(`/api/cultivos/${id}`)),
  create: (body) => unwrap(api.post("/api/cultivos", body)),
  update: (id, body) => unwrap(api.patch(`/api/cultivos/${id}`, body)),
  remove: (id) => api.delete(`/api/cultivos/${id}`),
  historial: (id) => unwrap(api.get(`/api/cultivos/${id}/historial`)),
};

export const alertasApi = {
  list: (params) => unwrap(api.get("/api/alertas", { params })),
  create: (body) => unwrap(api.post("/api/alertas", body)),
  update: (id, body) => unwrap(api.patch(`/api/alertas/${id}`, body)),
  remove: (id) => api.delete(`/api/alertas/${id}`),
  unseenCount: () => unwrap(api.get("/api/alertas/unseen-count")),
  markSeen: () => api.post("/api/alertas/mark-seen"),
};

export const cosechasApi = {
  list: (params) => unwrap(api.get("/api/cosechas", { params })),
  public: () => unwrap(api.get("/api/cosechas/public")),
  get: (id) => unwrap(api.get(`/api/cosechas/${id}`)),
  create: (body) => unwrap(api.post("/api/cosechas", body)),
  update: (id, body) => unwrap(api.patch(`/api/cosechas/${id}`, body)),
  remove: (id) => api.delete(`/api/cosechas/${id}`),
};

export const usuariosApi = {
  list: (params) => unwrap(api.get("/api/users", { params })),
  me: () => unwrap(api.get("/api/users/me")),
  updateMe: (body) => unwrap(api.patch("/api/users/me", body)),
  setActive: (id, isActive) => unwrap(api.patch(`/api/users/${id}`, { is_active: isActive })),
  create: (body) => unwrap(api.post("/api/users", body)),
  update: (id, body) => unwrap(api.patch(`/api/users/${id}`, body)),
  remove: (id) => api.delete(`/api/users/${id}`),
};

export const dashboardApi = {
  get: (biohuertoId) => unwrap(api.get(`/api/dashboard/${biohuertoId}`)),
  overview: (dias = 30) => unwrap(api.get("/api/dashboard/overview", { params: { dias } })),
};

export const monitoreoApi = {
  list: (arg) => unwrap(api.get("/api/monitoreo", { params: asParams(arg) })),
  create: (body) => unwrap(api.post("/api/monitoreo", body)),
};

export const incidenciasApi = {
  list: (arg) => unwrap(api.get("/api/incidencias", { params: asParams(arg) })),
  create: (body) => unwrap(api.post("/api/incidencias", body)),
  update: (id, body) => unwrap(api.patch(`/api/incidencias/${id}`, body)),
  remove: (id) => api.delete(`/api/incidencias/${id}`),
};

export const cuidadosApi = {
  list: (arg) => unwrap(api.get("/api/cuidados", { params: asParams(arg) })),
  create: (body) => unwrap(api.post("/api/cuidados", body)),
  update: (id, body) => unwrap(api.patch(`/api/cuidados/${id}`, body)),
  remove: (id) => api.delete(`/api/cuidados/${id}`),
  marcarRealizado: (id) => unwrap(api.post(`/api/cuidados/${id}/realizado`)),
};

export const diagnosticoApi = {
  list: (params) => unwrap(api.get("/api/diagnostico", { params })),
  imagen: (body) => unwrap(api.post("/api/diagnostico/imagen", body, { timeout: 60000 })),
  guiado: (body) => unwrap(api.post("/api/diagnostico/guiado", body, { timeout: 270000 })),
  recomendacion: (id) => unwrap(api.post(`/api/diagnostico/${id}/recomendacion`, {}, { timeout: 270000 })),
};

export const recomendacionesApi = {
  list: (params) => unwrap(api.get("/api/recomendaciones", { params })),
  create: (body) => unwrap(api.post("/api/recomendaciones", body)),
  update: (id, body) => unwrap(api.patch(`/api/recomendaciones/${id}`, body)),
  generarGeneral: (cultivoId) =>
    unwrap(api.post(`/api/recomendaciones/cultivo/${cultivoId}/general`, {}, { timeout: 270000 })),
};

export const ragApi = {
  status: () => unwrap(api.get("/api/rag/status")),
  uploadPdf: ({ file, fuente, reemplazar }) =>
    unwrap(
      api.post("/api/rag/documentos", file, {
        params: {
          filename: file.name,
          fuente: fuente || undefined,
          reemplazar,
        },
        headers: { "Content-Type": file.type || "application/pdf" },
        timeout: 270000,
      })
    ),
  removeFuente: (fuente) => unwrap(api.delete("/api/rag/fuentes", { params: { fuente } })),
};

export const trazabilidadApi = {
  practicas: (arg) => unwrap(api.get("/api/trazabilidad/practicas", { params: asParams(arg) })),
  crearPractica: (body) => unwrap(api.post("/api/trazabilidad/practicas", body)),
  costos: (arg) => unwrap(api.get("/api/trazabilidad/costos", { params: asParams(arg) })),
  crearCosto: (body) => unwrap(api.post("/api/trazabilidad/costos", body)),
  resumen: (biohuertoId) => unwrap(api.get(`/api/trazabilidad/biohuertos/${biohuertoId}/resumen`)),
};

// Catálogos (selectores + "agregar nuevo" para los extensibles)
export const catalogosApi = {
  list: (catalogo) => unwrap(api.get(`/api/catalogos/${catalogo}`)),
  create: (catalogo, body) => unwrap(api.post(`/api/catalogos/${catalogo}`, body)),
};

// Entidades fuente (catálogos maestros): rail + CRUD admin
export const entidadesApi = {
  meta: () => unwrap(api.get("/api/entidades")),
  list: (key) => unwrap(api.get(`/api/entidades/${key}`)),
  create: (key, body) => unwrap(api.post(`/api/entidades/${key}`, body)),
  update: (key, id, body) => unwrap(api.patch(`/api/entidades/${key}/${id}`, body)),
  remove: (key, id) => api.delete(`/api/entidades/${key}/${id}`),
};

// Control de acceso por rol (matriz de permisos vista × acción)
export const accesoApi = {
  matriz: () => unwrap(api.get("/api/acceso/matriz")),
  me: () => unwrap(api.get("/api/acceso/me")),
  setPermisos: (rolId, permisos) =>
    unwrap(api.put(`/api/acceso/roles/${rolId}/permisos`, { permisos })),
};

export const campaniasApi = {
  list: () => unwrap(api.get("/api/campanias")),
  create: (body) => unwrap(api.post("/api/campanias", body)),
  update: (id, body) => unwrap(api.patch(`/api/campanias/${id}`, body)),
  remove: (id) => api.delete(`/api/campanias/${id}`),
};
