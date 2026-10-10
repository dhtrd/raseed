/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { copyFileSync } from "node:fs";

// GitHub Pages لا يرسل ترويسات أمان، فتُحقن CSP كوسم meta في البناء فقط (Vite في التطوير يحتاج سكربتات مضمّنة).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const cspPlugin = {
  name: "raseed-csp",
  apply: "build" as const,
  transformIndexHtml: (html: string) =>
    html.replace("<!--csp-->", `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
};

// GitHub Pages لا يعرف مسارات الواجهة (مثل /raseed/users): 404.html نسخة من index.html كي يفتح الرابط المباشر
const spaFallback = {
  name: "raseed-spa-404",
  apply: "build" as const,
  closeBundle() {
    const out = fileURLToPath(new URL("./dist/", import.meta.url));
    copyFileSync(`${out}index.html`, `${out}404.html`);
  },
};

// base: GitHub Pages يخدم المشروع تحت /raseed/
export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/raseed/" : "/",
  plugins: [react(), cspPlugin, spaFallback],
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
          include: ["src/**/*.test.{ts,tsx}", "tools/**/*.test.ts"],
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
