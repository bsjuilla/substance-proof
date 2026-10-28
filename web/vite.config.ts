import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" lets the same build work at a sub-path (GitHub Pages) and from the local server.
export default defineConfig({
  root: import.meta.dirname,
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    // changeOrigin rewrites Host to the server's, which the server's anti-CSRF check requires.
    proxy: {
      "/api": { target: "http://127.0.0.1:8787", changeOrigin: true },
      "/files": { target: "http://127.0.0.1:8787", changeOrigin: true },
      "/uploads": { target: "http://127.0.0.1:8787", changeOrigin: true },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
