import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import path from "path";
import manifest from "./public/manifest.json" with { type: "json" };

export default defineConfig({
  plugins: [react(), crx({ manifest: manifest as any })],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: "index.html",
        search: "search.html",
      },
    },
  },
});
