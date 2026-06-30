import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      registerType: "prompt",
      includeAssets: ["pwa/*.png"],
      manifest: {
        id: "/",
        name: "Biohuerto Inteligente",
        short_name: "Biohuerto",
        description: "Gestion local-first de biohuertos, cultivos y cosechas.",
        lang: "es-PE",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#f3f6f1",
        theme_color: "#0e3a23",
        orientation: "portrait-primary",
        icons: [
          { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          { name: "Registrar monitoreo", short_name: "Monitoreo", url: "/monitoreo" },
          { name: "Ver mercado", short_name: "Mercado", url: "/mercado" },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,wasm,png,jpg,jpeg,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  optimizeDeps: { exclude: ["@sqlite.org/sqlite-wasm"] },
  server: {
    host: true,
    watch: { usePolling: true, interval: 150 },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          pdf: ["jspdf"],
        },
      },
    },
  },
});
