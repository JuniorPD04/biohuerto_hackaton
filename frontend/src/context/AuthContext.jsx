import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, setAccessTokenGetter, setUnauthorizedHandler } from "../lib/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(null);
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const tokenRef = useRef(null);

  const storeSession = useCallback((payload) => {
    tokenRef.current = payload.access_token;
    setAccessToken(payload.access_token);
    setUser(payload.user);
  }, []);

  const clearSession = useCallback(() => {
    tokenRef.current = null;
    setAccessToken(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.post("/auth/refresh");
      storeSession(data);
      return true;
    } catch {
      clearSession();
      return false;
    }
  }, [clearSession, storeSession]);

  useEffect(() => {
    setAccessTokenGetter(() => tokenRef.current);
    setUnauthorizedHandler(refresh);
  }, [refresh]);

  useEffect(() => {
    refresh().finally(() => setBooting(false));
  }, [refresh]);

  const login = useCallback(
    async (values) => {
      const { data } = await api.post("/auth/login", values);
      storeSession(data);
      return data.user;
    },
    [storeSession]
  );

  const register = useCallback(
    async (values) => {
      const { data } = await api.post("/auth/register", values);
      storeSession(data);
      return data.user;
    },
    [storeSession]
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo(
    () => ({
      accessToken,
      user,
      booting,
      isAuthenticated: Boolean(accessToken && user),
      login,
      register,
      logout,
      refresh,
    }),
    [accessToken, booting, login, logout, refresh, register, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }
  return context;
}

