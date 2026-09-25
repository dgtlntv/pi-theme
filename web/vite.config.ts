/**
 * Vite config for the review app. `npm run web` serves it with hot reload from ../src
 * (the real generator); `npm run web:build` writes a single self-contained web/dist/index.html.
 *
 * @module
 */
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), viteSingleFile()],
  server: { fs: { allow: [".."] } },
  build: { outDir: "dist", emptyOutDir: true },
});
