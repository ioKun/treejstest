import { defineConfig } from "vite";

const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  base: "./",
  server: {
    headers: isolationHeaders,
  },
  preview: {
    headers: isolationHeaders,
  },
});

