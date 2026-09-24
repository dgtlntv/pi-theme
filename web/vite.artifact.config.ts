import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
// Multi-file build for Radius artifacts: every file stays under the upload size limit.
export default defineConfig({
  root: import.meta.dirname,
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist-artifact",
    emptyOutDir: true,
    rollupOptions: { output: { manualChunks: (id) => id.includes("node_modules/react") ? "react" : id.includes("node_modules/colorjs") ? "colorjs" : id.includes("/src/") && !id.includes("/web/") ? "generator" : undefined } },
  },
});
