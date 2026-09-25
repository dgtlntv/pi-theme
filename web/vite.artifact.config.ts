/**
 * Vite config for the Radius artifact: a multi-file build, so every file stays under
 * the upload size limit.
 *
 * @module
 */
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
  root: import.meta.dirname,
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist-artifact",
    emptyOutDir: true,
    rollupOptions: { output: { manualChunks: (id) => id.includes("node_modules/react") ? "react" : id.includes("/src/") && !id.includes("/web/") ? "generator" : undefined } },
  },
});
