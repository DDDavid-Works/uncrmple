/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { PRODUCT_NAME, TAGLINE } from "./src/config";
import { SECURITY_HEADERS } from "./src/security-headers";

export default defineConfig({
  plugins: [
    react(),
    {
      // Fill %PRODUCT_NAME% / %TAGLINE% in index.html from src/config.ts, so branding lives in one place.
      name: "branding",
      transformIndexHtml: (html) => html.replaceAll("%PRODUCT_NAME%", PRODUCT_NAME).replaceAll("%TAGLINE%", TAGLINE),
    },
  ],
  server: { port: 7200, strictPort: true },
  // The dev server is left without them: its hot reload needs inline scripts and its own connections.
  preview: { port: 7200, strictPort: true, headers: SECURITY_HEADERS },
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
