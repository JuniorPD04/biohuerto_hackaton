import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

let getAccessToken = () => null;
let handleUnauthorized = null;
let refreshPromise = null;

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 8000,
  headers: {
    "Content-Type": "application/json",
  },
});

export function setAccessTokenGetter(getter) {
  getAccessToken = getter;
}

export function setUnauthorizedHandler(handler) {
  handleUnauthorized = handler;
}

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const isAuthPath = original?.url?.startsWith("/auth/");

    if (status === 401 && original && !original._retry && !isAuthPath && handleUnauthorized) {
      original._retry = true;
      refreshPromise ||= handleUnauthorized().finally(() => {
        refreshPromise = null;
      });
      const refreshed = await refreshPromise;
      if (refreshed) {
        return api(original);
      }
    }

    return Promise.reject(error);
  }
);

export async function downloadPdf(path, filename) {
  const response = await api.get(path, {
    responseType: "blob",
    headers: { Accept: "application/pdf" },
  });
  const url = window.URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
