import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" lets the same build work at a sub-path (GitHub Pages) and from the local server.
export default defineConfig({
  root: import.meta.dirname,
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:8787", "/files": "http://127.0.0.1:8787", "/uploads": "http://127.0.0.1:8787" },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
