/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// base: GitHub Pages يخدم المشروع تحت /raseed/
export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/raseed/" : "/",
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: { sourcemap: false, target: "es2022" },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./tests/setup.ts"],
          include: ["src/**/*.test.{ts,tsx}"],
          css: { modules: { classNameStrategy: "non-scoped" } },
        },
      },
      {
        extends: true,
        test: {
          name: "rules",
          environment: "node",
          include: ["tests/rules/**/*.test.ts"],
          testTimeout: 20000,
          fileParallelism: false,
        },
      },
    ],
  },
}));
