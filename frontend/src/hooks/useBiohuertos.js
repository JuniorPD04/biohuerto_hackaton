import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";

export function useBiohuertos() {
  const [biohuertos, setBiohuertos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/api/biohuertos");
      setBiohuertos(data);
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudieron cargar los biohuertos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = useMemo(() => biohuertos[0] || null, [biohuertos]);

  return { biohuertos, selected, loading, error, reload: load };
}

