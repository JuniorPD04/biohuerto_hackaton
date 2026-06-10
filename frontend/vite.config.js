import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // En Windows + Docker los eventos de filesystem no cruzan el bind mount,
    // así que Vite no detecta los cambios. El polling fuerza la detección.
    watch: { usePolling: true, interval: 150 },
  },
});
