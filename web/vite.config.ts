import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// `npm run web` serves with hot reload from ../src (the real generator).
// `npm run web:build` writes a single self-contained web/dist/index.html.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), viteSingleFile()],
  server: { fs: { allow: [".."] } },
  build: { outDir: "dist", emptyOutDir: true },
});
