import { api } from "./api.js";

const unwrap = (p) => p.then((r) => r.data);

export const biohuertosApi = {
  list: () => unwrap(api.get("/api/biohuertos")),
  get: (id) => unwrap(api.get(`/api/biohuertos/${id}`)),
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
  list: (cultivoId) => unwrap(api.get("/api/monitoreo", { params: { cultivo_id: cultivoId } })),
  create: (body) => unwrap(api.post("/api/monitoreo", body)),
};

export const incidenciasApi = {
  list: (cultivoId) => unwrap(api.get("/api/incidencias", { params: { cultivo_id: cultivoId } })),
  create: (body) => unwrap(api.post("/api/incidencias", body)),
  update: (id, body) => unwrap(api.patch(`/api/incidencias/${id}`, body)),
  remove: (id) => api.delete(`/api/incidencias/${id}`),
};

export const cuidadosApi = {
  list: (cultivoId) => unwrap(api.get("/api/cuidados", { params: { cultivo_id: cultivoId } })),
  create: (body) => unwrap(api.post("/api/cuidados", body)),
  update: (id, body) => unwrap(api.patch(`/api/cuidados/${id}`, body)),
  remove: (id) => api.delete(`/api/cuidados/${id}`),
  marcarRealizado: (id) => unwrap(api.post(`/api/cuidados/${id}/realizado`)),
};

export const diagnosticoApi = {
  list: (params) => unwrap(api.get("/api/diagnostico", { params })),
  imagen: (body) => unwrap(api.post("/api/diagnostico/imagen", body, { timeout: 60000 })),
  recomendacion: (id) => unwrap(api.post(`/api/diagnostico/${id}/recomendacion`, {}, { timeout: 270000 })),
};

export const recomendacionesApi = {
  list: (params) => unwrap(api.get("/api/recomendaciones", { params })),
  create: (body) => unwrap(api.post("/api/recomendaciones", body)),
  update: (id, body) => unwrap(api.patch(`/api/recomendaciones/${id}`, body)),
  generarGeneral: (cultivoId) =>
    unwrap(api.post(`/api/recomendaciones/cultivo/${cultivoId}/general`, {}, { timeout: 270000 })),
};

export const trazabilidadApi = {
  practicas: (cultivoId) => unwrap(api.get("/api/trazabilidad/practicas", { params: { cultivo_id: cultivoId } })),
  crearPractica: (body) => unwrap(api.post("/api/trazabilidad/practicas", body)),
  costos: (cultivoId) => unwrap(api.get("/api/trazabilidad/costos", { params: { cultivo_id: cultivoId } })),
  crearCosto: (body) => unwrap(api.post("/api/trazabilidad/costos", body)),
  resumen: (biohuertoId) => unwrap(api.get(`/api/trazabilidad/biohuertos/${biohuertoId}/resumen`)),
};
