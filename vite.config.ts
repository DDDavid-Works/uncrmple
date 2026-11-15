/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { DESCRIPTION, PRODUCT_NAME, TAGLINE } from "./src/config";
import { contentSecurityPolicyFor, SECURITY_HEADERS } from "./src/security-headers";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export default defineConfig({
  plugins: [
    react(),
    {
      // Fill %PRODUCT_NAME% / %TAGLINE% / %DESCRIPTION% in index.html from src/config.ts, so branding lives in one place.
      name: "branding",
      transformIndexHtml: (html) =>
        html
          .replaceAll("%PRODUCT_NAME%", escapeHtml(PRODUCT_NAME))
          .replaceAll("%TAGLINE%", escapeHtml(TAGLINE))
          .replaceAll("%DESCRIPTION%", escapeHtml(DESCRIPTION)),
    },
    {
      // `vite preview` sends the production headers, with the worker's stricter policy on its script.
      name: "security-headers",
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
          res.setHeader("Content-Security-Policy", contentSecurityPolicyFor((req as { url?: string }).url ?? "/"));
          next();
        });
      },
    },
  ],
  server: { port: 7200, strictPort: true },
  // The dev server is left without them: its hot reload needs inline scripts and its own connections.
  preview: { port: 7200, strictPort: true },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/tests/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // The OpenCV.js export is a thenable emscripten Module; interop on an externalized CJS
    // package would make `import()` try to await it.
    server: { deps: { inline: ["@techstark/opencv-js"] } },
  },
});
