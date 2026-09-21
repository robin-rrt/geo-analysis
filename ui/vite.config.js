import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Two builds from one source:
//
//   default  — served by `geo-audit serve`, talks to the API, can start runs
//   export   — a single self-contained HTML file for publishing to a domain.
//              MODE=export swaps the API client for the static one at build
//              time, so the published bundle does not CONTAIN the run-trigger
//              code. That makes "the export cannot spend money" structural
//              rather than a promise.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === "export" ? [viteSingleFile()] : [])],
  build: {
    outDir: mode === "export" ? "dist-export" : "dist",
    emptyOutDir: true,
  },
  server: {
    proxy: { "/api": "http://127.0.0.1:4317" },
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
}));
