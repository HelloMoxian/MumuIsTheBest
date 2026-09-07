import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  plugins: [react()],
  publicDir: false,
  server: { host: "127.0.0.1", port: 5176, strictPort: true },
  build: {
    outDir: "/tmp/mumu-stargazing-build",
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: "assets/stargazing.js", chunkFileNames: "assets/[name].js", assetFileNames: "assets/[name][extname]" } },
  },
});
