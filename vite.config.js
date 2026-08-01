import { defineConfig } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  // Public assets are copied from an explicit allow-list after build.
  // This prevents internal/test fixtures from being published accidentally.
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        driver: path.resolve(__dirname, "driver.html"),
        staff: path.resolve(__dirname, "staff.html"),
      },
      output: {
        manualChunks(id) {
          const norm = id.replaceAll("\\", "/");
          if (norm.endsWith("/translations.js")) return "translations";
          return undefined;
        },
      },
    },
    // Do not publish source maps with embedded application source in production.
    sourcemap: false,
    target: "es2020",
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": {
        target: "http://localhost:8766",
        changeOrigin: true,
      },
    },
  },
});
