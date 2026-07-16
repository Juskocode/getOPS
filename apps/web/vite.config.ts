import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: true,
    target: "es2023",
  },
  server: {
    fs: {
      allow: ["../.."],
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8780",
        changeOrigin: false,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
  },
});
